const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { parseFile } = require('../services/documentParser');
const { parseDocumentContext } = require('../services/claudeService');

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.docx', '.txt'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only .pdf, .docx, and .txt files are allowed'));
    }
  },
});

router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const text = await parseFile(req.file.path, req.file.mimetype);

    // Clean up uploaded file
    fs.unlink(req.file.path, () => {});

    const rawSuggestions = await parseDocumentContext(text);

    const suggestions = rawSuggestions.map((s) => ({
      id: uuidv4(),
      title: s.title,
      content: s.content,
    }));

    res.json({ text: text.substring(0, 8000), suggestions });
  } catch (error) {
    // Clean up file on error
    if (req.file) {
      fs.unlink(req.file.path, () => {});
    }

    console.error('Upload error:', error.message);
    res.status(500).json({
      error:
        "We couldn't read this file. Please try a different format or paste your content directly.",
    });
  }
});

module.exports = router;
