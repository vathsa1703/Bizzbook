const fs = require('fs');
const path = require('path');

const filesToFix = [
  'src/api/placeholders.js',
  'src/config/automationSchema.js',
  'src/pages/Assistant.jsx',
  'src/pages/GstMaster.jsx',
  'src/pages/GstSettings.jsx',
  'src/pages/MarketingTools.jsx',
  'src/pages/Register.jsx',
  'src/pages/SetupWizard.jsx'
];

filesToFix.forEach(file => {
  const fullPath = path.join(process.cwd(), file);
  if (fs.existsSync(fullPath)) {
    let content = fs.readFileSync(fullPath, 'utf8');
    if (content.includes('\\`')) {
      content = content.replace(/\\`/g, '`');
      fs.writeFileSync(fullPath, content);
      console.log(`Fixed ${file}`);
    }
  }
});
