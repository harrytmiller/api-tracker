import React, { useState, useEffect } from 'react';
import { signOut } from 'firebase/auth';
import { auth, db } from '../config/firebase';
import { collection, addDoc, onSnapshot, updateDoc, doc, query, where, deleteDoc } from 'firebase/firestore';
import { Filter } from 'lucide-react';

function Dashboard({ user }) {
  const [jobs, setJobs] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showLeftFilter, setShowLeftFilter] = useState(false);
  const [showRightFilter, setShowRightFilter] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [addingJob, setAddingJob] = useState(false);
  
  const [newJob, setNewJob] = useState({
    companyName: '',
    role: '',
    applyDate: new Date().toISOString().split('T')[0],
    status: 'Applied'
  });
  
  const [leftDateRange, setLeftDateRange] = useState({ start: '', end: '' });
  const [rightDateRange, setRightDateRange] = useState({ start: '', end: '' });

  const STATUS_OPTIONS = [
    'Applied',
    'First next step',
    'Passed next step',
    'Interview',
    'Offer received'
  ];

  useEffect(() => {
    const savedDarkMode = localStorage.getItem('darkMode') === 'true';
    setDarkMode(savedDarkMode);
  }, []);

  useEffect(() => {
    if (!user) return;

    const jobsQuery = query(
      collection(db, 'jobs'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(jobsQuery, (snapshot) => {
      const jobsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setJobs(jobsData);
      console.log('Jobs loaded:', jobsData);
    }, (error) => {
      console.error('Error loading jobs:', error);
    });

    return () => unsubscribe();
  }, [user]);

  const toggleDarkMode = () => {
    const newDarkMode = !darkMode;
    setDarkMode(newDarkMode);
    localStorage.setItem('darkMode', newDarkMode.toString());
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteAccount = async () => {
    if (!window.confirm('Delete your account? This cannot be undone.')) return;
    
    try {
      const currentUser = auth.currentUser;
      if (currentUser) await currentUser.delete();
    } catch (error) {
      if (error.code === 'auth/requires-recent-login') {
        alert('Please log out and log back in before deleting your account.');
      } else {
        alert('Error deleting account. Please try again.');
      }
    }
  };

  const addJob = async () => {
    console.log('Add job clicked');
    console.log('Current newJob state:', newJob);
    console.log('User:', user);

    if (!newJob.companyName.trim()) {
      alert('Please enter a company name');
      return;
    }
    if (!newJob.role.trim()) {
      alert('Please enter a role');
      return;
    }

    setAddingJob(true);

    try {
      const jobData = {
        companyName: newJob.companyName,
        role: newJob.role,
        applyDate: newJob.applyDate,
        status: newJob.status,
        userId: user.uid,
        createdAt: new Date()
      };

      console.log('Attempting to add job with data:', jobData);

      const docRef = await addDoc(collection(db, 'jobs'), jobData);

      console.log('Job added successfully with ID:', docRef.id);

      setNewJob({
        companyName: '',
        role: '',
        applyDate: new Date().toISOString().split('T')[0],
        status: 'Applied'
      });
      setShowAddModal(false);
    } catch (error) {
      console.error('Error adding job:', error);
      alert('Error adding job: ' + error.message);
    } finally {
      setAddingJob(false);
    }
  };

  const updateJob = async (jobId, field, value) => {
    try {
      await updateDoc(doc(db, 'jobs', jobId), { [field]: value });
      console.log('Job updated successfully');
    } catch (error) {
      console.error('Error updating job:', error);
      alert('Error updating job: ' + error.message);
    }
  };

  const deleteJob = async (jobId) => {
    if (!window.confirm('Delete this job?')) return;
    try {
      await deleteDoc(doc(db, 'jobs', jobId));
      console.log('Job deleted successfully');
    } catch (error) {
      console.error('Error deleting job:', error);
      alert('Error deleting job: ' + error.message);
    }
  };

  const filterJobsByDate = (jobs, dateRange) => {
    if (!dateRange.start && !dateRange.end) return jobs;
    
    return jobs.filter(job => {
      const jobDate = new Date(job.applyDate);
      if (dateRange.start && jobDate < new Date(dateRange.start)) return false;
      if (dateRange.end && jobDate > new Date(dateRange.end)) return false;
      return true;
    });
  };

  const leftFilteredJobs = filterJobsByDate(jobs, leftDateRange);
  const rightFilteredJobs = filterJobsByDate(jobs, rightDateRange);

  const calculateAnalytics = () => {
    const total = rightFilteredJobs.length;
    if (total === 0) return [];

    // Calculate cumulative counts - jobs count towards their current stage AND all previous stages
    const getCumulativeCount = (stage) => {
      const stageIndex = STATUS_OPTIONS.indexOf(stage);
      return rightFilteredJobs.filter(job => {
        const jobStageIndex = STATUS_OPTIONS.indexOf(job.status);
        return jobStageIndex >= stageIndex; // Job is at this stage or beyond
      }).length;
    };

    const cumulativeCounts = STATUS_OPTIONS.map(status => getCumulativeCount(status));

    return [
      {
        stage: 'Applied',
        count: cumulativeCounts[0],
        percentOfTotal: 100,
        percentOfPrevious: '-'
      },
      {
        stage: 'First next step',
        count: cumulativeCounts[1],
        percentOfTotal: total > 0 ? ((cumulativeCounts[1] / total) * 100).toFixed(1) : 0,
        percentOfPrevious: cumulativeCounts[0] > 0 ? ((cumulativeCounts[1] / cumulativeCounts[0]) * 100).toFixed(1) : 0
      },
      {
        stage: 'Passed next step',
        count: cumulativeCounts[2],
        percentOfTotal: total > 0 ? ((cumulativeCounts[2] / total) * 100).toFixed(1) : 0,
        percentOfPrevious: cumulativeCounts[1] > 0 ? ((cumulativeCounts[2] / cumulativeCounts[1]) * 100).toFixed(1) : 0
      },
      {
        stage: 'Interview',
        count: cumulativeCounts[3],
        percentOfTotal: total > 0 ? ((cumulativeCounts[3] / total) * 100).toFixed(1) : 0,
        percentOfPrevious: cumulativeCounts[2] > 0 ? ((cumulativeCounts[3] / cumulativeCounts[2]) * 100).toFixed(1) : 0
      },
      {
        stage: 'Offer received',
        count: cumulativeCounts[4],
        percentOfTotal: total > 0 ? ((cumulativeCounts[4] / total) * 100).toFixed(1) : 0,
        percentOfPrevious: cumulativeCounts[3] > 0 ? ((cumulativeCounts[4] / cumulativeCounts[3]) * 100).toFixed(1) : 0
      }
    ];
  };

  const analytics = calculateAnalytics();
  const maxCount = Math.max(...analytics.map(a => a.count), 1);

  return (
    <>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        * { box-sizing: border-box; }
        
        /* Custom scrollbar styling */
        .scroll-container {
          background: transparent !important;
        }
        .scroll-container::-webkit-scrollbar {
          width: 8px;
        }
        .scroll-container::-webkit-scrollbar-track {
          background: transparent;
        }
        .scroll-container::-webkit-scrollbar-thumb {
          background: ${darkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)'};
          border-radius: 4px;
        }
        .scroll-container::-webkit-scrollbar-thumb:hover {
          background: ${darkMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)'};
        }
      `}</style>

      <div style={{
        minHeight: '100vh',
        background: darkMode ? '#1a1a1a' : '#f5f5f5',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}>
        {/* Header */}
        <header style={{
          background: darkMode ? '#2d2d2d' : 'white',
          padding: '16px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          position: 'sticky',
          top: 0,
          zIndex: 100
        }}>
          <div style={{
            fontSize: '20px',
            fontWeight: '700',
            color: darkMode ? '#fff' : '#333',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            Application Tracker
          </div>
          
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button
              onClick={() => setShowSettings(true)}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: darkMode ? '#3d3d3d' : '#f0f0f0',
                border: 'none',
                cursor: 'pointer',
                fontSize: '18px'
              }}
            >
              ⚙️
            </button>
            <button
              onClick={handleLogout}
              style={{
                padding: '8px 16px',
                background: '#667eea',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '600'
              }}
            >
              Logout
            </button>
          </div>
        </header>

        {/* Main Content - Split Layout */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '20px',
          padding: '20px',
          height: 'calc(100vh - 80px)'
        }}>
          {/* LEFT SIDE - Jobs Table */}
          <div style={{
            background: darkMode ? '#2d2d2d' : 'white',
            borderRadius: '12px',
            padding: '20px 10px 20px 20px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            overflow: 'hidden'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px',
              flexShrink: 0,
              paddingRight: '10px'
            }}>
              <div style={{
                fontSize: '18px',
                fontWeight: '600',
                color: darkMode ? '#fff' : '#333'
              }}>
                Jobs
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => {
                    console.log('Add button clicked');
                    setShowAddModal(true);
                  }}
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: darkMode ? '#3d3d3d' : '#f0f0f0',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '24px',
                    fontWeight: 'bold',
                    color: darkMode ? '#fff' : '#333'
                  }}
                >
                  +
                </button>
                <button
                  onClick={() => setShowLeftFilter(true)}
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: darkMode ? '#3d3d3d' : '#f0f0f0',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <Filter size={18} color={darkMode ? '#fff' : '#333'} />
                </button>
              </div>
            </div>

            <div 
              className="scroll-container"
              style={{ 
                flex: 1, 
                overflowY: 'auto',
                overflowX: 'hidden',
                background: 'transparent',
                paddingRight: '10px'
              }}
            >
              {leftFilteredJobs.length === 0 ? (
                <div style={{
                  textAlign: 'center',
                  padding: '40px',
                  color: darkMode ? '#666' : '#999'
                }}>
                  No jobs yet. Click + to add one!
                </div>
              ) : (
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '14px',
                  tableLayout: 'fixed'
                }}>
                  <thead>
                    <tr>
                      <th style={{
                        textAlign: 'left',
                        padding: '12px 8px',
                        borderBottom: darkMode ? '2px solid #3d3d3d' : '2px solid #e0e0e0',
                        color: darkMode ? '#aaa' : '#666',
                        fontWeight: '600',
                        fontSize: '12px',
                        textTransform: 'uppercase',
                        width: '22%'
                      }}>Company name</th>
                      <th style={{
                        textAlign: 'left',
                        padding: '12px 8px',
                        borderBottom: darkMode ? '2px solid #3d3d3d' : '2px solid #e0e0e0',
                        color: darkMode ? '#aaa' : '#666',
                        fontWeight: '600',
                        fontSize: '12px',
                        textTransform: 'uppercase',
                        width: '22%'
                      }}>Role</th>
                      <th style={{
                        textAlign: 'left',
                        padding: '12px 8px',
                        borderBottom: darkMode ? '2px solid #3d3d3d' : '2px solid #e0e0e0',
                        color: darkMode ? '#aaa' : '#666',
                        fontWeight: '600',
                        fontSize: '12px',
                        textTransform: 'uppercase',
                        width: '20%'
                      }}>Apply date</th>
                      <th style={{
                        textAlign: 'left',
                        padding: '12px 8px',
                        borderBottom: darkMode ? '2px solid #3d3d3d' : '2px solid #e0e0e0',
                        color: darkMode ? '#aaa' : '#666',
                        fontWeight: '600',
                        fontSize: '12px',
                        textTransform: 'uppercase',
                        width: '22.85%'
                      }}>Status</th>
                      <th style={{
                        textAlign: 'left',
                        padding: '12px 8px',
                        borderBottom: darkMode ? '2px solid #3d3d3d' : '2px solid #e0e0e0',
                        width: '11%'
                      }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {leftFilteredJobs.map(job => (
                      <tr key={job.id}>
                        <td style={{
                          padding: '12px 8px',
                          borderBottom: darkMode ? '1px solid #3d3d3d' : '1px solid #f0f0f0',
                          color: darkMode ? '#fff' : '#333'
                        }}>
                          <input
                            type="text"
                            value={job.companyName}
                            onChange={(e) => updateJob(job.id, 'companyName', e.target.value)}
                            style={{
                              width: '100%',
                              padding: '8px',
                              border: darkMode ? '1px solid #444' : '1px solid #ddd',
                              borderRadius: '4px',
                              background: darkMode ? '#1a1a1a' : 'white',
                              color: darkMode ? '#fff' : '#333',
                              fontSize: '14px'
                            }}
                          />
                        </td>
                        <td style={{
                          padding: '12px 8px',
                          borderBottom: darkMode ? '1px solid #3d3d3d' : '1px solid #f0f0f0'
                        }}>
                          <input
                            type="text"
                            value={job.role}
                            onChange={(e) => updateJob(job.id, 'role', e.target.value)}
                            style={{
                              width: '100%',
                              padding: '8px',
                              border: darkMode ? '1px solid #444' : '1px solid #ddd',
                              borderRadius: '4px',
                              background: darkMode ? '#1a1a1a' : 'white',
                              color: darkMode ? '#fff' : '#333',
                              fontSize: '14px'
                            }}
                          />
                        </td>
                        <td style={{
                          padding: '12px 8px',
                          borderBottom: darkMode ? '1px solid #3d3d3d' : '1px solid #f0f0f0'
                        }}>
                          <input
                            type="date"
                            value={job.applyDate}
                            onChange={(e) => updateJob(job.id, 'applyDate', e.target.value)}
                            style={{
                              width: '100%',
                              padding: '8px',
                              border: darkMode ? '1px solid #444' : '1px solid #ddd',
                              borderRadius: '4px',
                              background: darkMode ? '#1a1a1a' : 'white',
                              color: darkMode ? '#fff' : '#333',
                              fontSize: '14px'
                            }}
                          />
                        </td>
                        <td style={{
                          padding: '12px 8px',
                          borderBottom: darkMode ? '1px solid #3d3d3d' : '1px solid #f0f0f0'
                        }}>
                          <select
                            value={job.status}
                            onChange={(e) => updateJob(job.id, 'status', e.target.value)}
                            style={{
                              width: '100%',
                              padding: '8px',
                              border: darkMode ? '1px solid #444' : '1px solid #ddd',
                              borderRadius: '4px',
                              background: darkMode ? '#1a1a1a' : 'white',
                              color: darkMode ? '#fff' : '#333',
                              fontSize: '14px',
                              cursor: 'pointer'
                            }}
                          >
                            {STATUS_OPTIONS.map(status => (
                              <option key={status} value={status}>{status}</option>
                            ))}
                          </select>
                        </td>
                        <td style={{
                          padding: '12px 8px',
                          borderBottom: darkMode ? '1px solid #3d3d3d' : '1px solid #f0f0f0'
                        }}>
                          <button
                            onClick={() => deleteJob(job.id)}
                            style={{
                              padding: '6px 10px',
                              background: '#ef4444',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '12px',
                              width: '100%',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* RIGHT SIDE - Analytics */}
          <div style={{
            background: darkMode ? '#2d2d2d' : 'white',
            borderRadius: '12px',
            padding: '20px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'auto'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px'
            }}>
              <div style={{
                fontSize: '18px',
                fontWeight: '600',
                color: darkMode ? '#fff' : '#333'
              }}>
                Insights
              </div>
              <button
                onClick={() => setShowRightFilter(true)}
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  background: darkMode ? '#3d3d3d' : '#f0f0f0',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Filter size={18} color={darkMode ? '#fff' : '#333'} />
              </button>
            </div>

            {/* Bar Chart */}
            <div style={{ marginBottom: '30px' }}>
              <div style={{
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'space-around',
                height: '200px',
                marginBottom: '10px'
              }}>
                {analytics.map((item, idx) => {
                  // Calculate height: 
                  // - If count is 0, height is 0 (no bar)
                  // - If count is 1, use minimum height of 30px
                  // - If count > 1, scale proportionally with minimum of 30px
                  let barHeight = 0;
                  if (item.count === 0) {
                    barHeight = 0;
                  } else if (item.count === 1) {
                    barHeight = 30;
                  } else {
                    barHeight = Math.max(30, (item.count / maxCount) * 170);
                  }
                  
                  return (
                    <div key={idx} style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      flex: 1,
                      maxWidth: '80px'
                    }}>
                      {item.count > 0 && (
                        <div style={{
                          width: '100%',
                          background: '#667eea',
                          borderRadius: '4px 4px 0 0',
                          display: 'flex',
                          alignItems: 'flex-start',
                          justifyContent: 'center',
                          paddingTop: '8px',
                          color: 'white',
                          fontWeight: '600',
                          fontSize: '14px',
                          height: `${barHeight}px`
                        }}>
                          {item.count}
                        </div>
                      )}
                      {item.count === 0 && (
                        <div style={{
                          width: '100%',
                          color: darkMode ? '#666' : '#999',
                          fontWeight: '600',
                          fontSize: '14px',
                          textAlign: 'center',
                          marginBottom: '4px'
                        }}>
                          0
                        </div>
                      )}
                      <div style={{
                        marginTop: '8px',
                        fontSize: '10px',
                        color: darkMode ? '#aaa' : '#666',
                        textAlign: 'center',
                        lineHeight: '1.2',
                        wordWrap: 'break-word'
                      }}>
                        {item.stage}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Analytics Table */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <table style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '13px'
              }}>
                <thead>
                  <tr>
                    <th style={{
                      textAlign: 'left',
                      padding: '12px 8px',
                      borderBottom: darkMode ? '2px solid #3d3d3d' : '2px solid #e0e0e0',
                      color: darkMode ? '#aaa' : '#666',
                      fontWeight: '600',
                      fontSize: '11px',
                      textTransform: 'uppercase'
                    }}></th>
                    <th style={{
                      textAlign: 'left',
                      padding: '12px 8px',
                      borderBottom: darkMode ? '2px solid #3d3d3d' : '2px solid #e0e0e0',
                      color: darkMode ? '#aaa' : '#666',
                      fontWeight: '600',
                      fontSize: '11px',
                      textTransform: 'uppercase'
                    }}>Number of jobs</th>
                    <th style={{
                      textAlign: 'left',
                      padding: '12px 8px',
                      borderBottom: darkMode ? '2px solid #3d3d3d' : '2px solid #e0e0e0',
                      color: darkMode ? '#aaa' : '#666',
                      fontWeight: '600',
                      fontSize: '11px',
                      textTransform: 'uppercase'
                    }}>percentage out of jobs applied</th>
                    <th style={{
                      textAlign: 'left',
                      padding: '12px 8px',
                      borderBottom: darkMode ? '2px solid #3d3d3d' : '2px solid #e0e0e0',
                      color: darkMode ? '#aaa' : '#666',
                      fontWeight: '600',
                      fontSize: '11px',
                      textTransform: 'uppercase'
                    }}>percentage out of previous stage</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.map((item, idx) => (
                    <tr key={idx}>
                      <td style={{
                        padding: '12px 8px',
                        borderBottom: darkMode ? '1px solid #3d3d3d' : '1px solid #f0f0f0',
                        color: darkMode ? '#fff' : '#333'
                      }}>{item.stage}</td>
                      <td style={{
                        padding: '12px 8px',
                        borderBottom: darkMode ? '1px solid #3d3d3d' : '1px solid #f0f0f0',
                        color: darkMode ? '#fff' : '#333'
                      }}>{item.count}</td>
                      <td style={{
                        padding: '12px 8px',
                        borderBottom: darkMode ? '1px solid #3d3d3d' : '1px solid #f0f0f0',
                        color: darkMode ? '#fff' : '#333'
                      }}>{item.percentOfTotal}%</td>
                      <td style={{
                        padding: '12px 8px',
                        borderBottom: darkMode ? '1px solid #3d3d3d' : '1px solid #f0f0f0',
                        color: darkMode ? '#fff' : '#333'
                      }}>{typeof item.percentOfPrevious === 'number' ? `${item.percentOfPrevious}%` : item.percentOfPrevious}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Add Job Modal */}
        {showAddModal && (
          <div
            onClick={() => setShowAddModal(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: darkMode ? '#2d2d2d' : 'white',
                borderRadius: '12px',
                padding: '24px',
                width: '90%',
                maxWidth: '500px'
              }}
            >
              <h2 style={{
                fontSize: '20px',
                fontWeight: '700',
                marginBottom: '20px',
                color: darkMode ? '#fff' : '#333'
              }}>Add Job Application</h2>

              <div style={{ marginBottom: '16px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '600',
                  marginBottom: '8px',
                  color: darkMode ? '#aaa' : '#666'
                }}>Company Name</label>
                <input
                  type="text"
                  value={newJob.companyName}
                  onChange={(e) => setNewJob({ ...newJob, companyName: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: darkMode ? '1px solid #444' : '1px solid #ddd',
                    borderRadius: '8px',
                    fontSize: '16px',
                    background: darkMode ? '#1a1a1a' : 'white',
                    color: darkMode ? '#fff' : '#333'
                  }}
                  autoFocus
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '600',
                  marginBottom: '8px',
                  color: darkMode ? '#aaa' : '#666'
                }}>Role</label>
                <input
                  type="text"
                  value={newJob.role}
                  onChange={(e) => setNewJob({ ...newJob, role: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: darkMode ? '1px solid #444' : '1px solid #ddd',
                    borderRadius: '8px',
                    fontSize: '16px',
                    background: darkMode ? '#1a1a1a' : 'white',
                    color: darkMode ? '#fff' : '#333'
                  }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '600',
                  marginBottom: '8px',
                  color: darkMode ? '#aaa' : '#666'
                }}>Apply Date</label>
                <input
                  type="date"
                  value={newJob.applyDate}
                  onChange={(e) => setNewJob({ ...newJob, applyDate: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: darkMode ? '1px solid #444' : '1px solid #ddd',
                    borderRadius: '8px',
                    fontSize: '16px',
                    background: darkMode ? '#1a1a1a' : 'white',
                    color: darkMode ? '#fff' : '#333'
                  }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '600',
                  marginBottom: '8px',
                  color: darkMode ? '#aaa' : '#666'
                }}>Status</label>
                <select
                  value={newJob.status}
                  onChange={(e) => setNewJob({ ...newJob, status: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: darkMode ? '1px solid #444' : '1px solid #ddd',
                    borderRadius: '8px',
                    fontSize: '16px',
                    background: darkMode ? '#1a1a1a' : 'white',
                    color: darkMode ? '#fff' : '#333',
                    cursor: 'pointer'
                  }}
                >
                  {STATUS_OPTIONS.map(status => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setNewJob({
                      companyName: '',
                      role: '',
                      applyDate: new Date().toISOString().split('T')[0],
                      status: 'Applied'
                    });
                  }}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: darkMode ? '#3d3d3d' : '#f0f0f0',
                    color: darkMode ? '#fff' : '#666',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '16px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                  disabled={addingJob}
                >
                  Cancel
                </button>
                <button
                  onClick={addJob}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: addingJob ? '#999' : '#667eea',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '16px',
                    fontWeight: '600',
                    cursor: addingJob ? 'not-allowed' : 'pointer'
                  }}
                  disabled={addingJob}
                >
                  {addingJob ? 'Adding...' : 'Add'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Left Filter Modal */}
        {showLeftFilter && (
          <div
            onClick={() => setShowLeftFilter(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: darkMode ? '#2d2d2d' : 'white',
                borderRadius: '12px',
                padding: '24px',
                width: '90%',
                maxWidth: '400px'
              }}
            >
              <h2 style={{
                fontSize: '20px',
                fontWeight: '700',
                marginBottom: '20px',
                color: darkMode ? '#fff' : '#333'
              }}>Filter Jobs by Date</h2>

              <div style={{ marginBottom: '16px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '600',
                  marginBottom: '8px',
                  color: darkMode ? '#aaa' : '#666'
                }}>Start Date</label>
                <input
                  type="date"
                  value={leftDateRange.start}
                  onChange={(e) => setLeftDateRange({ ...leftDateRange, start: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: darkMode ? '1px solid #444' : '1px solid #ddd',
                    borderRadius: '8px',
                    fontSize: '16px',
                    background: darkMode ? '#1a1a1a' : 'white',
                    color: darkMode ? '#fff' : '#333'
                  }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '600',
                  marginBottom: '8px',
                  color: darkMode ? '#aaa' : '#666'
                }}>End Date</label>
                <input
                  type="date"
                  value={leftDateRange.end}
                  onChange={(e) => setLeftDateRange({ ...leftDateRange, end: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: darkMode ? '1px solid #444' : '1px solid #ddd',
                    borderRadius: '8px',
                    fontSize: '16px',
                    background: darkMode ? '#1a1a1a' : 'white',
                    color: darkMode ? '#fff' : '#333'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => setLeftDateRange({ start: '', end: '' })}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: darkMode ? '#3d3d3d' : '#f0f0f0',
                    color: darkMode ? '#fff' : '#666',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '16px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Clear
                </button>
                <button
                  onClick={() => setShowLeftFilter(false)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: '#667eea',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '16px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Right Filter Modal */}
        {showRightFilter && (
          <div
            onClick={() => setShowRightFilter(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: darkMode ? '#2d2d2d' : 'white',
                borderRadius: '12px',
                padding: '24px',
                width: '90%',
                maxWidth: '400px'
              }}
            >
              <h2 style={{
                fontSize: '20px',
                fontWeight: '700',
                marginBottom: '20px',
                color: darkMode ? '#fff' : '#333'
              }}>Filter Analytics by Date</h2>

              <div style={{ marginBottom: '16px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '600',
                  marginBottom: '8px',
                  color: darkMode ? '#aaa' : '#666'
                }}>Start Date</label>
                <input
                  type="date"
                  value={rightDateRange.start}
                  onChange={(e) => setRightDateRange({ ...rightDateRange, start: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: darkMode ? '1px solid #444' : '1px solid #ddd',
                    borderRadius: '8px',
                    fontSize: '16px',
                    background: darkMode ? '#1a1a1a' : 'white',
                    color: darkMode ? '#fff' : '#333'
                  }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '600',
                  marginBottom: '8px',
                  color: darkMode ? '#aaa' : '#666'
                }}>End Date</label>
                <input
                  type="date"
                  value={rightDateRange.end}
                  onChange={(e) => setRightDateRange({ ...rightDateRange, end: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: darkMode ? '1px solid #444' : '1px solid #ddd',
                    borderRadius: '8px',
                    fontSize: '16px',
                    background: darkMode ? '#1a1a1a' : 'white',
                    color: darkMode ? '#fff' : '#333'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => setRightDateRange({ start: '', end: '' })}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: darkMode ? '#3d3d3d' : '#f0f0f0',
                    color: darkMode ? '#fff' : '#666',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '16px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Clear
                </button>
                <button
                  onClick={() => setShowRightFilter(false)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: '#667eea',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '16px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Settings Modal */}
        {showSettings && (
          <div
            onClick={() => setShowSettings(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: darkMode ? '#2d2d2d' : 'white',
                borderRadius: '12px',
                padding: '24px',
                width: '90%',
                maxWidth: '400px'
              }}
            >
              <h2 style={{
                fontSize: '20px',
                fontWeight: '700',
                marginBottom: '20px',
                color: darkMode ? '#fff' : '#333'
              }}>Settings</h2>

              <div style={{
                padding: '16px',
                borderBottom: darkMode ? '1px solid #3d3d3d' : '1px solid #f0f0f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span style={{ color: darkMode ? '#fff' : '#333' }}>Dark Mode</span>
                <input
                  type="checkbox"
                  checked={darkMode}
                  onChange={toggleDarkMode}
                  style={{ cursor: 'pointer' }}
                />
              </div>

              <button
                onClick={handleDeleteAccount}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  marginTop: '16px'
                }}
              >
                Delete Account
              </button>

              <button
                onClick={() => setShowSettings(false)}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: darkMode ? '#3d3d3d' : '#f0f0f0',
                  color: darkMode ? '#fff' : '#666',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  marginTop: '12px'
                }}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default Dashboard;