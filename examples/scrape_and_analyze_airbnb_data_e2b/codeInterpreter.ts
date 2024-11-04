import { CodeInterpreter } from '@e2b/code-interpreter'

export async function codeInterpret(
  codeInterpreter: CodeInterpreter,
  code: string
) {
  console.log(
    `\n${'='.repeat(50)}\n> Running following AI-generated code:\n${code}\n${'='.repeat(50)}`
  )

  const exec = await codeInterpreter.notebook.execCell(code, {
    // You can stream logs from the code interpreter
    // onStderr: (stderr: string) => console.log("\n[Code Interpreter stdout]", stderr),
    // onStdout: (stdout: string) => console.log("\n[Code Interpreter stderr]", stdout),
    //
    // You can also stream additional results like charts, images, etc.
    // onResult: ...
  })

  if (exec.error) {
    console.log('[Code Interpreter error]', exec.error) // Runtime error
    return undefined
  }

  return exec
}
