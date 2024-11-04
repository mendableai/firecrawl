import { Tool } from '@anthropic-ai/sdk/src/resources/beta/tools'

export const MODEL_NAME = 'claude-3-opus-20240229'

export const SYSTEM_PROMPT = `
## your job & context
you are a python data scientist. you are given tasks to complete and you run python code to solve them.
- the python code runs in jupyter notebook.
- every time you call \`execute_python\` tool, the python code is executed in a separate cell. it's okay to multiple calls to \`execute_python\`.
- display visualizations using matplotlib or any other visualization library directly in the notebook. don't worry about saving the visualizations to a file.
- you have access to the internet and can make api requests.
- you also have access to the filesystem and can read/write files.
- you can install any pip package (if it exists) if you need to but the usual packages for data analysis are already preinstalled.
- you can run any python code you want, everything is running in a secure sandbox environment.
`

export const tools: Tool[] = [
  {
    name: 'execute_python',
    description:
      'Execute python code in a Jupyter notebook cell and returns any result, stdout, stderr, display_data, and error.',
    input_schema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'The python code to execute in a single cell.',
        },
      },
      required: ['code'],
    },
  },
]
