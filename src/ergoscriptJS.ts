type Box = {
  inputs: {
    value: string,
    additionalRegisters: { R5: string, R6: string }
  }[],
  outputs: {
    value: string,
    additionalRegisters: { R5: string, R6: string }
  }[]
}

async function buildScriptScope(tx: Box) {
  const Long = 'Long'
  const INPUTS = [
    { value: JSON.parse(tx.inputs[0].value), R5: { Long: { get: tx.inputs[0].additionalRegisters.R5 }}, R6: { Long: { get: tx.inputs[0].additionalRegisters.R6 }}},
    { value: JSON.parse(tx.inputs[1].value), R5: { Long: { get: tx.inputs[1].additionalRegisters.R5 }}, R6: { Long: { get: tx.inputs[1].additionalRegisters.R6 }}}
  ];

  const OUTPUTS = [
    { value: JSON.parse(tx.outputs[0].value), R5: { Long: { get: tx.outputs[0].additionalRegisters.R5 }}, R6: { Long: { get: tx.outputs[0].additionalRegisters.R6 }}},
    { value: JSON.parse(tx.outputs[1].value), R5: { Long: { get: tx.outputs[1].additionalRegisters.R5 }}, R6: { Long: { get: tx.outputs[1].additionalRegisters.R6 }}}
  ];

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
      console.log(resp)
      return resp;
    }
  }
}


function replacer(str: string) {
  const replaced = str
    .replaceAll('(0)', '[0]')
    .replaceAll('(1)', '[1]')
    .replaceAll('val ', 'var ')

    return replaced;
}


// export buildScriptScope;
export {}