const ExtractorBot = require('./extractor-bot')
const fs = require("fs")
const path = require("path")
const util = require("util")
const readdir = util.promisify(fs.readdir)

const inputRootFolder = "../phx-handshapes"

async function main() {
  let folders = await readdir(inputRootFolder, {withFileTypes: true})
  let labels = folders.filter((x)=> x.isDirectory()).map((x)=> x.name)

  let dataset = []
  for (const label of labels) {
    let files = await readdir(path.join(inputRootFolder, label))
    let videos = files.filter((x)=> x.match(/\.(mp4|mkv|m4v|avi|mov|ogg|heif|webm)$/))
    videos.forEach((videoFilename)=> {
      dataset.push({label: label, videoPath: path.join(inputRootFolder, label, videoFilename)})
    })
  }

  //console.log(dataset)
  //return 
  let bot = new ExtractorBot({
    outputFolder: "/Users/phx/Downloads/phx-handshapes-frames",
    keypoints: ['fakeRightHand'],
    qualitySelector: (point) => point.quality > 0.1,
    dataset: dataset,
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