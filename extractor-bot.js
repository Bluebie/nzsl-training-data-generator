var VideoReader = require('./video-reader')
var NZSL = require('./nzsl').dataset("../NZSL-Dictionary")
var PoseMachine = require('./pose-machine')
var fs = require('fs')
var util = require('util')
var path = require('path')

// A robot that crawls through the NZSL-Dictionary database, using PoseMachine to extract information about
// frames in the main demonstration videos, and writing samples out to a set of training folders, for use
// training ML models to recognise traits of BANZLAN signed languages
// ExtractorBot takes care of the messy stuff like keeping track of progress, pausing and resuming safely,
// only looking at certain ranges, and organising the filesystem
class ExtractorBot {
  constructor(config) {
    this.config = config
    this.state = null
    this.loaded = false
  }

  // do any initial setup tasks like loading PoseMachine's models
  // returns promise, resolves when the bot is ready to run
  async init() {
    if (this.loaded) return
    if (!this.config.outputFolder) throw new Error("config outputFolder is required")
    if (!this.config.stateFilePath) this.config.stateFilePath = path.join(this.config.outputFolder, 'state.json')
    if (!this.config.videoFilters) this.config.videoFilters = { gamma: 2.5, contrast: 1.1, gamma_weight: 0.3 }
    if (!this.config.nzslSelector) this.config.nzslSelector = (def)=> def.attributes.handshapes && def.attributes.handshapes.length > 0
    if (!this.config.labeler) this.config.labeler = (def)=> def.attributes.handshapes.map((fn)=> fn.split('-')[0])
    if (!this.config.keypoints) this.config.keypoints = ['fakeLeftHand', 'fakeRightHand']
    if (!this.config.extractSize) this.config.extractSize = 100
    if (!this.config.poseNet) this.config.poseNet = {
      imageScaleFactor: 0.5,
      outputStride: 16,
      flipHorizontal: false,
      poseNetMultiplier: 0.75,
    }
    if (!this.config.qualitySelector) this.config.qualitySelector = (point)=> point.quality > 0.5

    // make output directory if doesn't exist yet
    if (!fs.existsSync(this.config.outputFolder)) {
      fs.mkdirSync(this.config.outputFolder)
    }

    // initialise state if needed
    if (!fs.existsSync(this.config.stateFilePath)) {
      let entries = await NZSL.entries()
      let defaultState = {
        remainingTasks: entries,
        completedTasks: [],
        skippedTasks: [],
        imagesExtracted: 0
      }
      fs.writeFileSync(this.config.stateFilePath, JSON.stringify(defaultState))
    }

    // load the state
    this.state = JSON.parse(await util.promisify(fs.readFile)(this.config.stateFilePath))

    this._log("Loading PoseMachine/PoseNet Model, this will take a moment...")
    this.config.poseNet.log = this.config.log
    this.pm = new PoseMachine(this.config.poseNet)
    await this.pm.loadModel()
    this._log("Extractor Bot Initialised!")
  }

  // executes the configured task
  // optional argument is a callback function which outputs progress info
  // progress_callback accepts a single object as an argument
  // returns a promise which resolves when the entire task is complete
  async run(progress_callback) {
    if (!this.loaded) await this.init()

    while (this.state.remainingTasks.length > 0) {
      // remove a task from the queue
      let task = this.state.remainingTasks.shift()
      // lookup next NZSL definition
      let definition = await NZSL.lookup(task)

      // check if we should do this one
      if (this.config.nzslSelector(definition)) {
      // generate our label list
        let labels = this.config.labeler(definition)
        // check output sub-directories exist, and create them if they don't
        let labelPaths = labels.map((label)=> path.join(this.config.outputFolder, label))
        labelPaths.forEach((path)=> { if (!fs.existsSync(path)) fs.mkdirSync(path) })
        
        // process video from this definition
        this._log(`Processing ${definition.nzsl_id}...`)
        let video = await VideoReader.open(definition.videoPath)
        await this.pm.processVideo(video)
        

        // for each output path, cut out selected keypoints and write them out
        let extracts = []
        labelPaths.forEach((path)=> {
          this.config.keypoints.forEach((keypoint)=> {
            let e = this.pm.extractKeyPics(path, keypoint, this.config.extractSize, this.config.qualitySelector)
            extracts.push(e)
          })
        })

        // wait for image extractions to complete
        let totals = await Promise.all(extracts)
        let overallTotalPics = totals.reduce((a,b)=> a+b)
        this.state.imagesExtracted += overallTotalPics
        this._log(`Extracted ${overallTotalPics} images`)

        // clear out cache of video frames on disk.. maybe we should await this too? it's probably fine.
        video.close()

      } else {
        this.state.skippedTasks.push(task)
        this._log(`Skipped recognition task ${task} because nzslSelector returned false`)
      }

      // add to the completed list
      this.state.completedTasks.push(task)
      // write out updated state
      await util.promisify(fs.writeFile)(this.config.stateFilePath, JSON.stringify(this.state))
      if (progress_callback) progress_callback(this.state)
    }
    return this.state
  }

  _log(...args) {
    if (this.config.log) console.log(...args)
  }
}


module.exports = ExtractorBot
