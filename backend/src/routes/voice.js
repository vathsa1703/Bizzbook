const express = require('express');
const multer = require('multer');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { transcribeAudio } = require('../services/aiService');
const { convertWebmToWav } = require('../services/audioConverter');

const router = express.Router();

const storage = multer.diskStorage({
  destination: os.tmpdir(),
  filename: (req, file, cb) => {
    cb(null, `recording-${Date.now()}.webm`);
  },
});

const upload = multer({ storage });

router.post('/transcribe', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No audio file uploaded.' });
  }

  const webmPath = req.file.path;
  const wavPath = webmPath.replace('.webm', '.wav');

  try {
    await convertWebmToWav(webmPath, wavPath);
    const text = await transcribeAudio(wavPath);
    res.json({ text });
  } catch (err) {
    console.error('Transcription error:', err.message || err);
    res.status(500).json({ error: 'Transcription failed. Please try again.' });
  } finally {
    // Clean up temp files regardless of success or failure
    fs.unlink(webmPath, () => {});
    fs.unlink(wavPath, () => {});
  }
});

module.exports = router;