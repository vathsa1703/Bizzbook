const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ENV_PATH = path.join(__dirname, '..', '..', '.env');
const EXAMPLE_PATH = path.join(__dirname, '..', '..', '.env.example');

function createBackup() {
  if (fs.existsSync(ENV_PATH)) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${ENV_PATH}.${timestamp}.backup`;
    fs.copyFileSync(ENV_PATH, backupPath);
    console.log(`[Backup] Saved previous .env to ${backupPath}`);
  }
}

async function promptConfirmation() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    rl.question('WARNING: You are about to modify backend/.env. Do you want to proceed? (y/N) ', answer => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

async function updateEnv() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help')) {
    console.log('Usage: node update-env.js [KEY=VALUE ...]');
    console.log('Example: node update-env.js PORT=5003 OPENAI_API_KEY=123');
    process.exit(0);
  }

  // Always create a backup before attempting to write
  createBackup();

  // If no arguments, copy from .env.example
  if (args.length === 0) {
    console.log('No arguments provided. Initializing from .env.example...');
    if (!fs.existsSync(EXAMPLE_PATH)) {
      console.error('.env.example not found!');
      process.exit(1);
    }
    fs.copyFileSync(EXAMPLE_PATH, ENV_PATH);
    console.log('Successfully copied .env.example to .env');
    process.exit(0);
  }

  // Confirm modification of existing vars
  const confirm = await promptConfirmation();
  if (!confirm) {
    console.log('Operation aborted.');
    process.exit(0);
  }

  let envContent = '';
  if (fs.existsSync(ENV_PATH)) {
    envContent = fs.readFileSync(ENV_PATH, 'utf8');
  }

  const envLines = envContent.split('\n');
  
  args.forEach(arg => {
    const [key, ...valParts] = arg.split('=');
    const val = valParts.join('=');
    
    let updated = false;
    for (let i = 0; i < envLines.length; i++) {
      if (envLines[i].startsWith(`${key}=`)) {
        envLines[i] = `${key}=${val}`;
        updated = true;
        break;
      }
    }
    
    if (!updated) {
      envLines.push(`${key}=${val}`);
    }
  });

  fs.writeFileSync(ENV_PATH, envLines.join('\n'));
  console.log('[Success] Updated .env safely.');
}

updateEnv();
