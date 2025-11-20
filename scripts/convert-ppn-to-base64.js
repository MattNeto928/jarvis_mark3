#!/usr/bin/env node
/**
 * Convert .ppn file to base64 for testing
 * This can help diagnose platform mismatch issues
 */

const fs = require('fs');
const path = require('path');

const ppnPath = process.argv[2] || 'public/wake-words/jarvis.ppn';
const outputPath = process.argv[3] || 'public/wake-words/jarvis-base64.txt';

try {
  console.log('📄 Reading .ppn file:', ppnPath);
  const fileData = fs.readFileSync(ppnPath);
  
  console.log('📊 File statistics:');
  console.log('   Size:', fileData.length, 'bytes');
  console.log('   Size (KB):', (fileData.length / 1024).toFixed(2), 'KB');
  
  if (fileData.length < 10000) {
    console.warn('⚠️  WARNING: File is very small (< 10KB)');
    console.warn('   Web/WASM .ppn files are typically 30-100KB');
    console.warn('   This suggests the file might be for a different platform');
  }
  
  console.log('\n🔍 First 64 bytes (hex):');
  console.log('   ', fileData.slice(0, 64).toString('hex').match(/.{1,32}/g).join('\n    '));
  
  console.log('\n📝 Converting to base64...');
  const base64 = fileData.toString('base64');
  
  console.log('✅ Base64 length:', base64.length, 'characters');
  console.log('📁 Writing to:', outputPath);
  
  fs.writeFileSync(outputPath, base64);
  console.log('✅ Base64 saved to:', outputPath);
  console.log('\n💡 You can now use this base64 string in your code');
  console.log('   Or try loading the file as base64 instead of publicPath');
  
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
