import { expect } from 'chai';
import { utxos } from './jsons/utxos';
import { UtxoBox } from '../services/types';

function mergeBoxes(utxos: UtxoBox[]) {
  const firstBox: UtxoBox = Object.assign({}, {}, utxos[0]);

  for (let i = 1; i < utxos.length; i++) {
    firstBox.value = (parseInt(firstBox.value) + parseInt(utxos[i].value)).toString();
    firstBox.assets = firstBox.assets.concat(utxos[i].assets);
  }

  const summedAssets = firstBox.assets.reduce<Record<string, number>>((map, token) => {
    map[token.tokenId] = map[token.tokenId] || 0;
    map[token.tokenId] += parseInt(token.amount);
    return map;
  }, {});

  firstBox.assets = Object.keys(summedAssets).map((key) => {
    return { tokenId: key, amount: summedAssets[key].toString() };
  });

  return firstBox;
}

describe('mergeBoxes', () => {
  it('merges the boxes into one', () => {
    const merged = mergeBoxes(utxos);
    expect(parseInt(merged.assets[1].amount)).to.equal(
      parseInt(utxos[0].assets[1].amount) + parseInt(utxos[1].assets[0].amount),
    );
  });
});
