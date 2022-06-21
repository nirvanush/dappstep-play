import { post } from '../lib/rest';
import { Asset, Balance } from './types';
import request from 'superagent';
import { ErgoBox } from '@coinbarn/ergo-ts';

export async function p2sNode(contract: string) {
  const url = 'https://0dj9ag2t1h.execute-api.us-west-1.amazonaws.com/compile';
  return await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: '{"source":"' + contract.replaceAll('\n', '\\n').replaceAll('"', '\\"') + '"}',
  })
    .then((res) => res.json())
    .then((res) => {
      if (res.success === false) {
        console.error(res.detail);
        throw new Error(res.detail);
      }
      return res;
    });
}

export async function checkTx(tx: string) {
  const url = 'https://0dj9ag2t1h.execute-api.us-west-1.amazonaws.com/transactions/check';
  return await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: tx,
  })
    .then((res) => res.json())
    .then((res) => {
      if (res.success === false) {
        console.error(res.detail);
        throw new Error(res.detail);
      }
      return res;
    });
}

// export async function checkTx(tx: string) {
//   return await post('', tx)
//     .then((res) => res.json())
//     .then((res) => {
//       if (res.success === false) throw new Error();
//       return res;
//     });
// }

export async function currentHeight() {
  return request.get('https://api.ergoplatform.com/api/v0/blocks?limit=1').then((res) => res.body.items[0].height);
}

interface Dic {
  [key: string]: Asset;
}

export async function loadTokensFromWallet() {
  const addresses: string[] = (await ergo.get_used_addresses()).concat(await ergo.get_unused_addresses());
  const tokens: Dic = {};

  for (let i = 0; i < addresses.length; i++) {
    const balance: Balance = await getBalance(addresses[i]);
    balance.tokens.forEach((asset: Asset) => {
      if (!Object.keys(tokens).includes(asset.tokenId))
        tokens[asset.tokenId] = {
          amount: 0,
          name: asset.name,
          tokenId: asset.tokenId,
        };
      tokens[asset.tokenId].amount += asset.amount;
    });
  }

  return tokens;
}

export async function getBalance(addr: string): Promise<Balance> {
  return await fetch(`https://api.ergoplatform.com/api/v1/addresses/${addr}/balance/confirmed`).then((res) =>
    res.json(),
  );
}

export function isDappConnectorInstalled() {
  return typeof ergo_request_read_access === 'function';
}

export async function isWalletAccessibleForRead() {
  return await ergo_check_read_access();
}

export async function requestWalletReadAcess() {
  return await ergo_request_read_access();
}
