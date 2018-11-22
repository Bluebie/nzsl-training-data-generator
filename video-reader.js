const fs = require('fs')
const path = require('path')
const os = require('os')
const rmdirRecursive = require('rmdir-recursive')
const child = require('child_process')
const util = require('util')

// VideoReader is a simple interface to ffmpeg (which must have CLI tool installed in host system)
// it uses the CLI tool to convert short videos in to a sequence of png files in a temporary folder
// and provides access to those images to make randomly reading video files easy
class VideoReader {
  constructor(videoPath) {
    this.srcVideoPath = videoPath
    this.videoFilters = { gamma: 1.0, contrast: 1.0 }
    this.length = null
  }

  // decode video in to frame files
  // async, returns a promise which resolves when all frames are decoded and available via @frame and @frames
  decode() {
    return new Promise((resolve, reject)=> {
      fs.mkdtemp(path.join(os.tmpdir(), 'VideoReader-'), (err, folder)=> {
        if (err) return resolve(err)

        this.tempPath = folder
        child.execFile('ffmpeg', [
          '-i', this.srcVideoPath, '-vf',
          'eq=' + Object.entries(this.videoFilters).map(([key,val])=> `${key}=${val}`).join(':'),
          path.join(this.tempPath, 'frame-%00d.png')
        ], {}, (err, stdout, stderr)=> {
          if (err) return reject(err)
          // find last statement about final frame and store that as length
          var m = stderr.match(/frame=([ 0-9]+)fps=/)
          if (m) {
            this.length = parseInt(m[1].trim())
            resolve(this)
          } else {
            reject(stderr)
          }
        })
      })

    })
  }

  // return path to frame file
  frame(num) {
    if (!this.tempPath) throw new Error("VideoReader is not open, call decode() first")
    return path.join(this.tempPath, `frame-${parseInt(num)+1}.png`)
  }

  // get an array of frame paths
  frames() {
    if (!this.tempPath) throw new Error("VideoReader is not open, call decode() first")
    var result = []
    for (var i = 0; i < this.length; i++) {
      result[i] = path.join(this.tempPath, `frame-${i+1}.png`)
    }
    return result
  }

  // when done using this video, close it to free hard drive space
  // note, if close isn't called, temporary png files may pollute system drive indefinitely, be careful!
  async close() {
    if (!this.tempPath) return
    await util.promisify(rmdirRecursive)(this.tempPath)
    this.tempPath = null
    this.length = null
  }
}

// async, open a video file and decode it
// returns a promise, which resolves a decoded VideoReader
VideoReader.open = function(videoPath, filters) {
  var reader = new VideoReader(videoPath)
  if (filters) Object.keys(filters).forEach((key)=> reader.videoFilters[key] = filters[key])
  return reader.decode()
}

module.exports = VideoReader
