import React, { useState } from 'react';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  signInAnonymously
} from 'firebase/auth';
import { auth } from '../config/firebase';

function Auth() {
  const [authMode, setAuthMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleGuestLogin = async () => {
    setError('');
    try {
      await signInAnonymously(auth);
    } catch (err) {
      setError(err.message);
    }
  };

  const styles = {
    authContainer: {
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#2d2d2d',
      padding: '20px'
    },
    authBox: {
      background: 'white',
      padding: '40px',
      borderRadius: '16px',
      boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
      width: '100%',
      maxWidth: '400px'
    },
    title: {
      margin: '0 0 8px 0',
      textAlign: 'center',
      color: '#333'
    },
    subtitle: {
      textAlign: 'center',
      color: '#666',
      marginBottom: '24px'
    },
    authTabs: {
      display: 'flex',
      gap: '8px',
      marginBottom: '24px',
      background: '#f5f5f5',
      padding: '4px',
      borderRadius: '8px'
    },
    tabButton: {
      flex: 1,
      padding: '10px',
      border: 'none',
      background: 'transparent',
      borderRadius: '6px',
      cursor: 'pointer',
      fontWeight: '500',
      color: '#666',
      transition: 'all 0.2s'
    },
    tabButtonActive: {
      flex: 1,
      padding: '10px',
      border: 'none',
      background: 'white',
      borderRadius: '6px',
      cursor: 'pointer',
      fontWeight: '500',
      color: '#667eea',
      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
      transition: 'all 0.2s'
    },
    error: {
      background: '#fee',
      border: '1px solid #fcc',
      color: '#c33',
      padding: '12px',
      borderRadius: '8px',
      marginBottom: '16px',
      fontSize: '14px'
    },
    input: {
      width: '100%',
      padding: '12px',
      marginBottom: '16px',
      border: '1px solid #ddd',
      borderRadius: '8px',
      fontSize: '16px',
      boxSizing: 'border-box'
    },
    submitButton: {
      width: '100%',
      padding: '12px',
      background: '#667eea',
      color: 'white',
      border: 'none',
      borderRadius: '8px',
      fontSize: '16px',
      fontWeight: '600',
      cursor: 'pointer',
      transition: 'background 0.2s'
    },
    divider: {
      textAlign: 'center',
      margin: '24px 0',
      color: '#999',
      position: 'relative'
    },
    dividerLine: {
      position: 'absolute',
      top: '50%',
      width: '40%',
      height: '1px',
      background: '#ddd'
    },
    guestButton: {
      width: '100%',
      padding: '12px',
      background: '#f5f5f5',
      border: '1px solid #ddd',
      borderRadius: '8px',
      fontSize: '16px',
      fontWeight: '600',
      cursor: 'pointer',
      transition: 'all 0.2s'
    }
  };

  return (
    <div style={styles.authContainer}>
      <div style={styles.authBox}>
        <h1 style={styles.title}>Application Tracker</h1>
        <p style={styles.subtitle}>Track your job applications</p>

        <div style={styles.authTabs}>
          <button
            onClick={() => setAuthMode('login')}
            style={authMode === 'login' ? styles.tabButtonActive : styles.tabButton}
          >
            Login
          </button>
          <button
            onClick={() => setAuthMode('register')}
            style={authMode === 'register' ? styles.tabButtonActive : styles.tabButton}
          >
            Register
          </button>
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={authMode === 'login' ? handleLogin : handleRegister}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={styles.input}
          />
          <input
            type="password"
            placeholder="Password (min 6 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            style={styles.input}
          />
          <button type="submit" style={styles.submitButton}>
            {authMode === 'login' ? 'Login' : 'Create Account'}
          </button>
        </form>

        <div style={styles.divider}>
          <span style={{...styles.dividerLine, left: 0}}></span>
          Or
          <span style={{...styles.dividerLine, right: 0}}></span>
        </div>

        <button onClick={handleGuestLogin} style={styles.guestButton}>
          Continue as Guest
        </button>
      </div>
    </div>
  );
}

export default Auth;