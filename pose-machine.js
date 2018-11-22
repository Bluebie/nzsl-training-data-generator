// script to use posenet to crop hands from a picture that contains hands
const sharp = require('sharp')
const tf = require('@tensorflow/tfjs')
require('@tensorflow/tfjs-node');  // Use '@tensorflow/tfjs-node-gpu' if running with GPU
const posenet = require('@tensorflow-models/posenet')
const fs = require('fs')
const path = require('path')
const VideoReader = require('./video-reader')
global.XMLHttpRequest = require('xhr2')

// utility functions

// take two x/y objects of coordinates, and predict the next point as a percentage between or after them
function interpolatePosition(a, b, percent) {
  return {
    x: a.x + ((b.x - a.x) * percent),
    y: a.y + ((b.y - a.y) * percent)
  }
}

// calculate distance between two positions
function positionDistance(a, b) {
  var diff = {x: Math.abs(b.x - a.x), y: Math.abs(b.y - a.y)}
  return Math.sqrt((diff.x * diff.x) + (diff.y * diff.y))
}

// convert args to an array of percentage strings padded
function toRound(...items) {
  return items.map((x)=> ((Math.round(x * 100) / 100) + "     ").substr(0, 5))
}


// PoseMachine is a wrapper around PoseNet and Sharp, to aid quickly classifying
// poses in videos, and extracting feature samples like images of hands, faces, etc
// built to gather sign language training dataset
// PoseMachine does some post processing to posenet and augments it's pose
// extimates with extra quality information to help make good decisions about
// which image samples to extract
class PoseMachine {
  constructor(config) {
    this.config = config
    this.net = null
    this.frames = []
  }

  // load PoseNet model, which is a slow operation, that takes about 5secs
  // returns a promise that resolves when loading is done and @processVideo is available
  async loadModel() {
    this.net = await posenet.load(this.config.poseNetMultiplier)
  }

  // async, given an input VideoReader object, PoseNet will watch it,
  // and augment poses with extra quality information
  // Returns a promise
  async processVideo(video) {
    if (!this.net) await this.loadModel()
    this.srcVideoPath = video.srcVideoPath
    let poseList = new Array(video.length)
    for (var frameID = 0; frameID < video.length; frameID++) {
      let framePath = video.frame(frameID)
      this._log(`Processing frame ${frameID}`)
      let pose = await this._processFrame(framePath)
      this._log(`Ok! Confidence: ${pose.score}`)
      poseList[frameID] = pose
    }
    this.frames = this._augmentFrameData(poseList)
    return this.frames
  }

  // write out files to a folder, labeled
  // args: path to existing folder to save pics to, e.g. '/tmp/extract'
  //       string part name or array index number, e.g. 'rightKnee'
  //       size in pixels of area to crop, e.g. 100
  //       selector function, (keypoint_object)=> returns boolean if image should be extracted
  // returns a promise, fulfilled when all images are written to disk, with number of images extracted
  async extractKeyPics(outputFolder, keypointID, size, selector) {
    let results = []
    for (let pose of this.frames) {
      let keypoint = pose.keypoints[keypointID]
      console.log(keypoint)
      console.log("Selector result: ", selector(keypoint))
      if (selector(keypoint)) {
        let filename = path.join(outputFolder, `${path.basename(this.srcVideoPath, '.png')} ${keypoint.part} frame-${pose.frameID}.png`)
        results.push(this.extractRegion(pose.frameID, keypoint.position, size, filename))
      }
    }
    await Promise.all(results)
    return results.length
  }

  // extracts a region of a frame and saves to disk
  async extractRegion(frameID, position, size, filename) {
    var img = sharp(this.frames[frameID].filename, {failOnError: true})
    var meta = await img.metadata()
    await img.extract({
      left:   Math.min(meta.width - size, Math.max(0, Math.round(position.x - (size / 2)))),
      top:    Math.min(meta.height - size, Math.max(0, Math.round(position.y - (size / 2)))),
      width:  size, height: size
    }).toFile(filename)
  }

  // internal, async, process pose from a frame
  // returns a promise
  async _processFrame(framePath) {
    let inputImg = sharp(framePath, {failOnError: true})
    let imageFormat = await inputImg.metadata().then((m) => [m.width, m.height])
    let imageSize = Math.max(...imageFormat)

    // extend image so it's a square, so posenet is happy
    var sharpImage = inputImg.resize(imageSize, imageSize, {fit: 'contain', position: 'top'})

    // convert to pixel buffer and info, and make a 3D tensor out of it
    let imageTensor = await sharpImage.raw().toBuffer({resolveWithObject:true}).then((raw) =>
      tf.tensor3d(raw.data, [raw.info.width, raw.info.height, raw.info.channels])
    )
    // run posenet on image data
    let pose = await this.net.estimateSinglePose(imageTensor,
      this.config.imageScaleFactor, this.config.flipHorizontal, this.config.outputStride);

    // clear that image from memory, we're done with it
    imageTensor.dispose()

    //console.log(`PoseNet confidence ${pose.score}`)
    pose.filename = framePath
    pose.frameFormat = imageFormat

    return pose
  }

  // add meta info to frames list, with extra quality assessments
  // returns immediately
  _augmentFrameData(poseList) {
    // append extra fake keypoints
    poseList.forEach((pose)=> {
      // estimate hand position by projecting from elbow to wrist and extending
      let handExtension = 1.3 // made up number that seems to work well enough
      pose.keypoints.push({
        score: pose.keypoints[PoseMachine.leftWrist].score * pose.keypoints[PoseMachine.leftElbow].score,
        part: 'fakeLeftHand',
        position: interpolatePosition(
          pose.keypoints[PoseMachine.leftElbow].position,
          pose.keypoints[PoseMachine.leftWrist].position, handExtension)
      })
      pose.keypoints.push({
        score: pose.keypoints[PoseMachine.rightWrist].score * pose.keypoints[PoseMachine.rightElbow].score,
        part: 'fakeRightHand',
        position: interpolatePosition(
          pose.keypoints[PoseMachine.rightElbow].position,
          pose.keypoints[PoseMachine.rightWrist].position, handExtension)
      })
    })

    // add quality and stability estimations
    poseList.forEach((pose, frameID)=> {
      var prev = poseList[frameID-1]
      var next = poseList[frameID+1]
      pose.frameID = frameID

      // generate extra score information for keypoints and add named keys
      pose.keypoints.forEach((keypoint, kID)=> {
        // if previous and next frames exist, calculate stability by estimating
        // this position as half way between the surrounding positions and
        // compare difference to make a score of how off prediction this frame
        // is, limiting quality of jittery low quality frames
        if (prev && next) {
          var prediction = interpolatePosition(prev.keypoints[kID].position, next.keypoints[kID].position, 0.5)
          var distance = positionDistance(prediction, keypoint.position)
          var allowance = Math.max(positionDistance(prev.keypoints[kID].position, next.keypoints[kID].position), 10)
          var stability = Math.max(0, Math.min(1, 1.0 - (distance / allowance)))
          keypoint.stability = stability
        } else {
          keypoint.stability = 0.0 // no border frames, cannot estimate in-between frame
        }
        // TODO: recognise other frame edges, not just the bottom edge
        keypoint.uncropped = Math.min(1, Math.max(0, (pose.frameFormat[1] - keypoint.position.y) / (pose.frameFormat[1] / 4)))

        // take the lowest value as the overall quality
        keypoint.quality = Math.min( keypoint.stability, keypoint.uncropped, keypoint.score )

        // add a named key to the keypoints array so it can be looked up by name also
        pose.keypoints[keypoint.part] = keypoint
      })

      var [l, r] = [pose.keypoints.leftWrist, pose.keypoints.rightWrist]
      this._log(`#${frameID} - left  `, ...toRound(l.score, l.stability, l.uncropped, l.quality))
      this._log(`#${frameID} - right `, ...toRound(r.score, r.stability, r.uncropped, r.quality))
      this._log(`---`)
    })
    return poseList
  }

  // internal, logs to console if logging enabled
  _log(...list) {
    if (this.config.log) console.log(...list)
  }
}

// generate a list of label keywords to lookup indexes in poses
PoseMachine.keypoints = ['nose','leftEye','rightEye','leftEar','rightEar',
'leftShoulder','rightShoulder','leftElbow','rightElbow','leftWrist',
'rightWrist','leftHip','rightHip','leftKnee','rightKnee','leftAnkle',
'rightAnkle','fakeLeftHand','fakeRightHand']
PoseMachine.keypoints.forEach((name, index)=> PoseMachine[name] = index )


module.exports = PoseMachine
