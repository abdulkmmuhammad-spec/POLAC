const bcrypt = require('bcryptjs');

const passwords = ['commandant', 'officer1'];
const SALT_ROUNDS = 10;

passwords.forEach(pw => {
  const hash = bcrypt.hashSync(pw, SALT_ROUNDS);
  console.log(`${pw}: ${hash}`);
});
