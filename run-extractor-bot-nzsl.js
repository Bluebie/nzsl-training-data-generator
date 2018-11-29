const ExtractorBot = require('./extractor-bot')
var NZSL = require('./nzsl').dataset("../NZSL-Dictionary")

async function main() {
  let bot = new ExtractorBot({
    outputFolder: "../extractor-bot-output-nzsl",
    keypoints: ['fakeRightHand'],
    //selector: (def)=> def.attributes.handshapes && def.attributes.handshapes.length > 0,
    //labeler: (def)=> def.attributes.handshapes.map((fn)=> fn.split('-')[0]),
    //videoPath: (def)=> def.videoPath,
    selector: (def)=> !def.skip,
    dataset: Promise.all(NZSL.entries().map((x)=> NZSL.lookup(x) )).map((def)=> {
      if (!def.attributes.handshapes || def.attributes.handshapes.length < 1) return {skip: true}
      return {videoPath: def.videoPath, labels: def.attributes.handshapes.map((fn)=> fn.split('-')[0])}
    }),
    log: true
  })
  let finalState = await bot.run()
  console.log("Process complete! Final tally:")
  console.log("Skipped Definitions: ", finalState.skippedTasks.length)
  console.log("Extracted Definitions: ", finalState.completedTasks.length - finalState.skippedTasks.length)
  console.log("Total images extracted: ", finalState.imagesExtracted)
  console.log("And we're done!")
}

main()