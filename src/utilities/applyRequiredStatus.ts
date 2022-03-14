import { GraphQLError } from '../error/GraphQLError';

import type {
  ListNullabilityNode,
  NullabilityDesignatorNode,
} from '../language/ast';
import { Kind } from '../language/kinds';
import type { ASTReducer } from '../language/visitor';
import { visit } from '../language/visitor';

import type { GraphQLOutputType } from '../type/definition';
import {
  assertListType,
  getNullableType,
  GraphQLList,
  GraphQLNonNull,
  isListType,
  isNonNullType,
} from '../type/definition';

/**
 * Implements the "Accounting For Client Controlled Nullability Designators"
 * section of the spec. In particular, this function figures out the true return
 * type of a field by taking into account both the nullability listed in the
 * schema, and the nullability providing by an operation.
 */
export function applyRequiredStatus(
  type: GraphQLOutputType,
  nullabilityNode?: ListNullabilityNode | NullabilityDesignatorNode,
): GraphQLOutputType {
  // If the field is marked with a single nullability designator
  //  short-circuit
  if (nullabilityNode?.element === undefined) {
    if (nullabilityNode?.kind === Kind.REQUIRED_DESIGNATOR) {
      return new GraphQLNonNull(getNullableType(type));
    } else if (nullabilityNode?.kind === Kind.OPTIONAL_DESIGNATOR) {
      return getNullableType(type);
    }
  }

  const typeStack: [GraphQLOutputType] = [type];

  // Load the nullable version each type in the type definition to typeStack
  while (isListType(getNullableType(typeStack[typeStack.length - 1]))) {
    const list = assertListType(
      getNullableType(typeStack[typeStack.length - 1]),
    );
    const elementType = list.ofType as GraphQLOutputType;
    typeStack.push(elementType);
  }

  // Re-apply nullability to each level of the list from the outside in
  const applyStatusReducer: ASTReducer<GraphQLOutputType> = {
    RequiredDesignator: {
      leave({ element }) {
        if (element) {
          return new GraphQLNonNull(getNullableType(element));
        }

        // We're working with the inner-most type
        const nextType = typeStack.pop();

        // There's no way for nextType to be null if both type and nullabilityNode are valid
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return new GraphQLNonNull(getNullableType(nextType!));
      },
    },
    OptionalDesignator: {
      leave({ element }) {
        if (element) {
          return getNullableType(element);
        }

        // We're working with the inner-most type
        const nextType = typeStack.pop();

        // There's no way for nextType to be null if both type and nullabilityNode are valid
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return getNullableType(nextType!);
      },
    },
    ListNullability: {
      leave({ element }) {
        let listType = typeStack.pop();
        // Skip to the inner-most list
        if (!isListType(getNullableType(listType))) {
          listType = typeStack.pop();
        }

        if (!listType) {
          throw new GraphQLError(
            'List nullability modifier is too deep.',
            nullabilityNode,
          );
        }
        const isRequired = isNonNullType(listType);
        if (element) {
          return isRequired
            ? new GraphQLNonNull(new GraphQLList(element))
            : new GraphQLList(element);
        }

        // We're working with the inner-most list
        return listType;
      },
    },
  };

  if (nullabilityNode) {
    const modified = visit(nullabilityNode, applyStatusReducer);
    // List nullability syntax must be exactly the same depth as the field type
    if (typeStack.length > 0) {
      throw new GraphQLError(
        'List nullability modifier is too shallow.',
        nullabilityNode,
      );
    }
    return modified;
  }

  return type;
}
