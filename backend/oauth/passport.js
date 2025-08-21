// backend/oauth/passport.js
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy  = require('passport-github2').Strategy;

const OAUTH_BASE = process.env.OAUTH_REDIRECT_BASE || 'http://localhost:3000';

// We don't serialize to sessions; we return the profile directly.
passport.serializeUser((user, cb) => cb(null, user));
passport.deserializeUser((obj, cb) => cb(null, obj));

function enabled(v) { return v && v.trim().length > 0; }

/** Google */
if (enabled(process.env.GOOGLE_CLIENT_ID) && enabled(process.env.GOOGLE_CLIENT_SECRET)) {
  passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${OAUTH_BASE}/api/oauth/google/callback`
    },
    (accessToken, refreshToken, profile, done) => done(null, { provider:'google', profile })
  ));
}

/** GitHub */
if (enabled(process.env.GITHUB_CLIENT_ID) && enabled(process.env.GITHUB_CLIENT_SECRET)) {
  passport.use(new GitHubStrategy({
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: `${OAUTH_BASE}/api/oauth/github/callback`,
      scope: [ 'user:email' ]
    },
    (accessToken, refreshToken, profile, done) => done(null, { provider:'github', profile })
  ));
}

module.exports = passport;
