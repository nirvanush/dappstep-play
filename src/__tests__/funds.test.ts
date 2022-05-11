import { expect } from 'chai';
import { utxos } from './jsons/utxos';
import { UtxoBox } from '../services/types';
import * as types from '../services/types';

// import fetchMock from 'fetch-mock';

import { sendFunds } from '../services/Transaction';

// {
//   get_used_addresses: () => {
//     hee: 3;
//   },
// };

beforeEach(() => {
  // fetchMock.get('https://api.ergoplatform.com/api/v0/blocks?limit=1', { items: [{ height: 3 }] });
});

describe('Transaction', () => {
  it('generates a send funds tx', async () => {
    const tx = await sendFunds({
      funds: { ERG: 0, tokens: [] },
      toAddress: 'sfd',
      additionalRegisters: {},
    });

    expect(tx).to.equal({});
  });
});
