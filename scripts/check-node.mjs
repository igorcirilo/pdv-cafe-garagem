if(Number(process.versions.node.split('.')[0])<24){console.error('Use Node.js 24 ou superior (64 bits) em https://nodejs.org/ e abra novamente este arquivo.');process.exit(1);}
try{await import('node:sqlite');}catch{console.error('Sua instalacao do Node.js nao oferece SQLite. Use Node.js 24 ou superior.');process.exit(1);}
