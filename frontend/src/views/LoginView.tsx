import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export const LoginView: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login(username, password);
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      backgroundColor: '#0a0e1a',
    }}>
      <div style={{
        backgroundColor: '#1a1f2e',
        padding: '2rem',
        borderRadius: '8px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
        width: '100%',
        maxWidth: '400px',
      }}>
        <h1 style={{
          color: '#fff',
          textAlign: 'center',
          marginBottom: '0.5rem',
          fontSize: '1.5rem',
        }}>
          dataMortem
        </h1>
        <p style={{
          color: '#888',
          textAlign: 'center',
          marginBottom: '2rem',
          fontSize: '0.875rem',
        }}>
          Digital Forensics Investigation Platform
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{
              display: 'block',
              color: '#ccc',
              marginBottom: '0.5rem',
              fontSize: '0.875rem',
            }}>
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              required
              autoFocus
              style={{
                width: '100%',
                padding: '0.75rem',
                backgroundColor: '#0a0e1a',
                border: '1px solid #333',
                borderRadius: '4px',
                color: '#fff',
                fontSize: '1rem',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{
              display: 'block',
              color: '#ccc',
              marginBottom: '0.5rem',
              fontSize: '0.875rem',
            }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              style={{
                width: '100%',
                padding: '0.75rem',
                backgroundColor: '#0a0e1a',
                border: '1px solid #333',
                borderRadius: '4px',
                color: '#fff',
                fontSize: '1rem',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {error && (
            <div style={{
              backgroundColor: '#2a1515',
              border: '1px solid #ff4444',
              color: '#ff6666',
              padding: '0.75rem',
              borderRadius: '4px',
              marginBottom: '1rem',
              fontSize: '0.875rem',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            style={{
              width: '100%',
              padding: '0.75rem',
              backgroundColor: isLoading ? '#555' : '#4a9eff',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              fontSize: '1rem',
              fontWeight: 'bold',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) => {
              if (!isLoading) {
                e.currentTarget.style.backgroundColor = '#3a8eef';
              }
            }}
            onMouseLeave={(e) => {
              if (!isLoading) {
                e.currentTarget.style.backgroundColor = '#4a9eff';
              }
            }}
          >
            {isLoading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <div style={{
          marginTop: '1.5rem',
          padding: '1rem',
          backgroundColor: '#0a0e1a',
          borderRadius: '4px',
          border: '1px solid #333',
        }}>
          <p style={{ color: '#888', fontSize: '0.75rem', margin: '0 0 0.5rem 0' }}>
            Default credentials:
          </p>
          <p style={{ color: '#ccc', fontSize: '0.875rem', margin: '0' }}>
            <strong>Username:</strong> admin<br />
            <strong>Password:</strong> admin123
          </p>
        </div>
      </div>
    </div>
  );
};
