const ExtractorBot = require('./extractor-bot')

let bot = new ExtractorBot({
  outputFolder: "/Users/phx/Downloads/extractor-bot-output",
  keypoints: ['fakeRightHand'],
  log: true
})

async function main() {
  let finalState = await bot.run()
  console.log("Process complete! Final tally:")
  console.log("Skipped Definitions: ", finalState.skippedTasks.length)
  console.log("Extracted Definitions: ", finalState.completedTasks.length - finalState.skippedTasks.length)
  console.log("Total images extracted: ", finalState.imagesExtracted)
  console.log("And we're done!")
}

main()