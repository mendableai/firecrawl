// @ts-ignore
import * as fs from 'fs'

import 'dotenv/config'
import { CodeInterpreter, Execution } from '@e2b/code-interpreter'
import Anthropic from '@anthropic-ai/sdk'
import { Buffer } from 'buffer'

import { MODEL_NAME, SYSTEM_PROMPT, tools } from './model'

import { codeInterpret } from './codeInterpreter'
import { scrapeAirbnb } from './scraping'

const anthropic = new Anthropic()

async function chat(
  codeInterpreter: CodeInterpreter,
  userMessage: string
): Promise<Execution | undefined> {
  console.log('Waiting for Claude...')

  const msg = await anthropic.beta.tools.messages.create({
    model: MODEL_NAME,
    system: SYSTEM_PROMPT,
    max_tokens: 4096,
    messages: [{ role: 'user', content: userMessage }],
    tools,
  })

  console.log(
    `\n${'='.repeat(50)}\nModel response: ${msg.content}\n${'='.repeat(50)}`
  )
  console.log(msg)

  if (msg.stop_reason === 'tool_use') {
    const toolBlock = msg.content.find((block) => block.type === 'tool_use')
    // @ts-ignore
    const toolName = toolBlock?.name ?? ''
    // @ts-ignore
    const toolInput = toolBlock?.input ?? ''

    console.log(
      `\n${'='.repeat(50)}\nUsing tool: ${toolName}\n${'='.repeat(50)}`
    )

    if (toolName === 'execute_python') {
      const code = toolInput.code
      return codeInterpret(codeInterpreter, code)
    }
    return undefined
  }
}

async function run() {
  // Load the Airbnb prices data from the JSON file
  let data
  const readDataFromFile = () => {
    try {
      return fs.readFileSync('airbnb_listings.json', 'utf8')
    } catch (err) {
      if (err.code === 'ENOENT') {
        console.log('File not found, scraping data...')
        return null
      } else {
        throw err
      }
    }
  }

  const fetchData = async () => {
    data = readDataFromFile()
    if (!data || data.trim() === '[]') {
      console.log('File is empty or contains an empty list, scraping data...')
      data = await scrapeAirbnb()
    }
  }

  await fetchData()

  // Parse the JSON data
  const prices = JSON.parse(data)

  // Convert prices array to a string representation of a Python list
  const pricesList = JSON.stringify(prices)

  const userMessage = `
  Load the Airbnb prices data from the airbnb listing below and visualize the distribution of prices with a histogram. Listing data: ${pricesList}
`

  const codeInterpreter = await CodeInterpreter.create()
  const codeOutput = await chat(codeInterpreter, userMessage)
  if (!codeOutput) {
    console.log('No code output')
    return
  }

  const logs = codeOutput.logs
  console.log(logs)

  if (codeOutput.results.length == 0) {
    console.log('No results')
    return
  }

  const firstResult = codeOutput.results[0]
  console.log(firstResult.text)

  if (firstResult.png) {
    const pngData = Buffer.from(firstResult.png, 'base64')
    const filename = 'airbnb_prices_chart.png'
    fs.writeFileSync(filename, pngData)
    console.log(`✅ Saved chart to ${filename}`)
  }

  await codeInterpreter.close()
}

run()
