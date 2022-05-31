import { zip } from "lodash";
import Transaction from "./Transaction";

Object.defineProperty(Array.prototype, 'size', { get: function size() { return this.length }})

async function buildScriptScope(tx: Transaction) {

  const Long = 'Long'
  const INPUTS = (i: number) => tx.inputs[i];
  INPUTS.size = tx.inputs.length;

  const OUTPUTS = (i: number) => tx.outputs[i];
  OUTPUTS.size = tx.outputs.length;

  const CONTEXT = {
    preHeader: {
      timestamp: Date.now()
    }
  }

  function sigmaProp(value: any) {
    return !!value;
  }

  function Coll() {
    return Array.from(arguments);
  }

  function allOf(arr: boolean[]) {
    return arr.every((element: boolean) => element === true);
  }

  return {
    execute: (script: string) => {
      const resp = eval(replacer(script));
      return resp;
    }
  }
}


function replacer(str: string) {
  const replaced = str
    .replaceAll('val ', 'var ')
    .replaceAll('Coll[Byte]', "'Coll[Byte]'")
    .replaceAll(/(\d+)L/g, "$1")

    return replaced;
}


// export buildScriptScope;
export default buildScriptScope;
