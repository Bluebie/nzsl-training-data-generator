var VideoReader = require('./video-reader')
var NZSL = require('./nzsl').dataset("../NZSL-Dictionary")
var PoseMachine = require('./pose-machine')
var fs = require('fs')
var util = require('util')

async function run() {
  // erase test-output
  var files = (await util.promisify(fs.readdir)('./test-output')).map((fn)=> `./test-output/${fn}`)
  await Promise.all(files.map((path)=> util.promisify(fs.unlink)(path)))

  // lookup an NZSL definition
  var data = await NZSL.lookup(254)
  console.log("NZSL.lookup result: ", data)

  // check entries api works
  var entries = await NZSL.entries()
  console.log(`NZSL Dataset has ${entries.length} definitions, the first is ${entries[0]}`)

  // open the definition's main video
  console.log("opening video...")
  var video = await VideoReader.open(data.videoPath)
  console.log("Opened, result: ", video)
  console.log("Length: ", video.length)
  console.log("Frame 0 path: ", video.frame(0))
  console.log("Frame path list:", video.frames())

  // initialise a PoseMachine to do the video analysis
  var pm = new PoseMachine({
    imageScaleFactor: 0.5,
    outputStride: 16,
    flipHorizontal: false,
    poseNetMultiplier: 0.75,
    log: true
  })

  // load the neural net model - this is a slow process - expect around 5 seconds before this resolves
  console.log("Model Loading")
  await pm.loadModel()
  console.log("Model Loaded")

  // process all the frames in the video we opened earlier
  console.log("Analizing video...")
  var result = await pm.processVideo(video)
  console.log("Results: ", result)

  // ask PoseMachine to save out pictures of a specific keypoint, to a specific folder, when a test is met
  var testKey = 'fakeLeftHand'
  var cropSize = 100 //px
  console.log(`Extracting ${testKey}...`)
  var extracted = await pm.extractKeyPics('./test-output', testKey, cropSize, (key)=> key.quality > 0.5)
  console.log(`Saved ${extracted} pics of ${testKey}`)
  console.log("Closing video...")

  // close video - this is important! forgetting to close leaves garbage png's in system temp folder,
  // wasting drive space
  video.close()
  console.log("All done!")
}

run()
