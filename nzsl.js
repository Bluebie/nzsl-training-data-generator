const fs = require('fs')
const path = require('path')
const util = require('util')

// NZSLReader is a glorified json loader
// it augments the NZSL-Dictionary data files by adding fully formed paths for some entries
// making it easier to access related files like videos
async function NZSLReader(dataset_path, nzsl_id) {
  let data = await util.promisify(fs.readFile)(path.join(dataset_path, 'data', `${parseInt(nzsl_id)}.json`))
  return new NZSLReader.SignData(dataset_path, JSON.parse(data))
}

// Represents one NZSL definition record
// TODO: Figure out what to do with the attributes property and it's file lists, regarding path resolution
NZSLReader.SignData = class SignData {
  constructor(dataset_path, data) {
    for (var key in data) {
      this[key] = data[key]
    }
    if (this.image)
      this.imagePath = path.join(dataset_path, 'image', this.image)
    if (this.video)
      this.videoPath = path.join(dataset_path, 'video', this.nzsl_id.toString(), this.video)
    if (this.usage) {
      for (var usage of this.usage) {
        if (usage.video)
          usage.videoPath = path.join(dataset_path, 'video', this.nzsl_id.toString(), usage.video)
      }
    }
    this.toString = function() {
      return JSON.stringify(data)
    }
  }
}

// Sets dataset filesystem path, returning an object with a 'lookup' method which returns a promise that
// resolves a fully formed SignData object
NZSLReader.dataset = function(dataset_path) {
  return {
    // async, resolves a SignData object with the data for this sign
    lookup: (nzsl_id)=> {
      return NZSLReader(dataset_path, nzsl_id)
    },
    // async, resolves a list of 
    entries: async function() {
      var fileList = await util.promisify(fs.readdir)(path.join(dataset_path, 'data'))
      return fileList.filter((x)=> x.match(/^[0-9]+\.json$/)).map((x)=> parseInt(x))
    },
    NZSLSignData: NZSLReader.SignData
  }
}

module.exports = NZSLReader
