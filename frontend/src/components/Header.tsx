import React from 'react';
import { useAuth } from '../contexts/AuthContext';

export const Header: React.FC = () => {
  const { user, logout } = useAuth();

  return (
    <div style={{
      backgroundColor: '#1a1f2e',
      borderBottom: '1px solid #333',
      padding: '0.75rem 1.5rem',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    }}>
      <div>
        <h1 style={{
          color: '#fff',
          margin: 0,
          fontSize: '1.25rem',
          fontWeight: 'bold',
        }}>
          dataMortem
        </h1>
        <p style={{
          color: '#888',
          margin: 0,
          fontSize: '0.75rem',
        }}>
          Digital Forensics Investigation Platform
        </p>
      </div>

      {user && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
        }}>
          <div style={{
            textAlign: 'right',
          }}>
            <div style={{
              color: '#fff',
              fontSize: '0.875rem',
              fontWeight: 'bold',
            }}>
              {user.full_name || user.username}
            </div>
            <div style={{
              color: '#888',
              fontSize: '0.75rem',
            }}>
              {user.role}
            </div>
          </div>
          <button
            onClick={logout}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#ff4444',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              fontSize: '0.875rem',
              cursor: 'pointer',
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#cc0000';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#ff4444';
            }}
          >
            Logout
          </button>
        </div>
      )}
    </div>
  );
};
