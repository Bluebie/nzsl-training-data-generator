NZSL Training Data Generator
============================

Reads data from @Bluebie/NZSL-Dictionary dataset, and uses ffmpeg to extract video frames, posenet & tensorflow.js to classify poses, and some manual filtering to assess quality. At the output stage, images of features like hands and faces can be extracted from the videos and labeled with metadata from the NZSL-Dictionary dataset like location and handshape.

This big mess is intended to be a tool for generating training datasets to teach a convolutional neural network to recognise BANZLAN sign language handshapes from video. I hope it can be useful to analise the linguistic features of related languages like Auslan and BSL, or build better models for computers to communicate directly using sign languages.

### Files

* `video-reader.js`: a simple ffmpeg interface, to convert video files in to a stack of PNG images in a temporary directory
* `pose-machine.js`: a wrapper around PoseNet, with some aditional filtering to improve quality signals and reject bad classifications
* `nzsl.js`: a really simple model to read in data from the NZSL-Dictionary dataset, and conveniently access related videos and image files
* `generate.js`: the main script, which will query the NZSL-Dictionary dataset and bulk export labeled training samples 
* `test.js`: a really bad test script that just pokes a few apis so i can see they're working, desperately in need of replacement with a propper testing system