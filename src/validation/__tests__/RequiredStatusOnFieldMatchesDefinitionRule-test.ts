import { expect } from 'chai';
import { describe, it } from 'mocha';

import { parse } from '../../language/parser';

import type { GraphQLSchema } from '../../type/schema';

import { buildSchema } from '../../utilities/buildASTSchema';

import { validate } from '../validate';

import { expectValidationErrorsWithSchema } from './harness';
import { RequiredStatusOnFieldMatchesDefinitionRule } from '../rules/RequiredStatusOnFieldMatchesDefinitionRule';

function expectErrors(queryStr: string) {
  return expectValidationErrorsWithSchema(
    testSchema,
    RequiredStatusOnFieldMatchesDefinitionRule,
    queryStr,
  );
}

function expectValid(queryStr: string) {
  expectErrors(queryStr).to.deep.equal([]);
}

const testSchema = buildSchema(`
  type Lists {
    nonList: Int
    list: [Int]
    mixedThreeDList: [[[Int]!]!]
  } 

  type Query {
    lists: Lists
  }
`);

describe('Validate: Field uses correct list depth', () => {
  it('Fields are valid', () => {
    expectValid(`
      fragment typeKnownAgain on Lists {
        list[!]
        nonList!
        mixedThreeDList[[[!]!]!]!
      }
    `);
  });

  it('reports errors when type is known again', () => {
    expectErrors(`
      fragment typeKnownAgain on Lists {
        list[[]]
        notAList: nonList[!]
        mixedThreeDList[[!]!]!
      }
    `).to.deep.equal([
      {
        message:
          'Syntax Error: Something is wrong with the nullability designator on list. The type for that field in the schema is [Int] Is the correct list depth being used?',
        locations: [{ line: 3, column: 9 }],
      },
      {
        message:
          'Syntax Error: Something is wrong with the nullability designator on notAList. The type for that field in the schema is Int Is the correct list depth being used?',
        locations: [{ line: 4, column: 9 }],
      },
    ]);
  });
});
