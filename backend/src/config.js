function requireProductionEnv(name) {
  const value = process.env[name];
  if (process.env.NODE_ENV === 'production' && !value) {
    throw new Error(`${name} is required in production`);
  }
  return value;
}

const JWT_SECRET = requireProductionEnv('JWT_SECRET');

if (process.env.NODE_ENV === 'production' && JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters in production');
}

module.exports = {
  JWT_SECRET,
};
