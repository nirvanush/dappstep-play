export default async function buildScriptScope(tx) {
  const Long = 'Long'
  const INPUTS = [
    { value: JSON.parse(tx.inputs[0].value), R5: { Long: { get: tx.inputs[0].additionalRegisters.R5 }}, R6: { Long: { get: tx.inputs[0].additionalRegisters.R6 }}},
    { value: JSON.parse(tx.inputs[1].value), R5: { Long: { get: tx.inputs[1].additionalRegisters.R5 }}, R6: { Long: { get: tx.inputs[1].additionalRegisters.R6 }}}
  ];

  const OUTPUTS = [
    { value: JSON.parse(tx.outputs[0].value), R5: { Long: { get: tx.outputs[0].additionalRegisters.R5 }}, R6: { Long: { get: tx.outputs[0].additionalRegisters.R6 }}},
    { value: JSON.parse(tx.outputs[1].value), R5: { Long: { get: tx.outputs[1].additionalRegisters.R5 }}, R6: { Long: { get: tx.outputs[1].additionalRegisters.R6 }}}
  ];

  function sigmaProp(value) {
    return !!value;
  }

  function Coll() {
    return Array.from(arguments);
  }

  function allOf(arr) {
    return arr.every(element => element === true);
  }

  return {
    execute: (script) => {
      const resp = eval(replacer(script));
      console.log(resp)
      return resp;
    }
  }
}

function replacer(str) {
  const replaced = str
    .replaceAll('(0)', '[0]')
    .replaceAll('(1)', '[1]')
    .replaceAll('val ', 'var ')

    return replaced;
}
