import React, { useState } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { useAppContext } from '../../context/AppContext';
import { ArrowLeft, User, Lock, Camera, Eye, EyeOff, Save, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';

interface AccountManagementProps {
  onBack: () => void;
}

export const AccountManagement: React.FC<AccountManagementProps> = ({ onBack }) => {
  const { state, dispatch } = useAppContext();
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [newAvatarUrl, setNewAvatarUrl] = useState('');
  const [avatarLoading, setAvatarLoading] = useState(false);
  
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false
  });
  const [passwordLoading, setPasswordLoading] = useState(false);

  const handleAvatarUpdate = async () => {
    if (!newAvatarUrl.trim()) {
      alert('Please enter a valid avatar URL');
      return;
    }

    setAvatarLoading(true);
    try {
      if (!state.currentUser) {
        alert('User not found. Please sign in again.');
        return;
      }
      
      const updatedUser = {
        ...state.currentUser,
        avatar: newAvatarUrl.trim()
      };
      
      localStorage.setItem('ainigama_user', JSON.stringify(updatedUser));
      dispatch({ type: 'SET_USER', payload: updatedUser });
      
      setNewAvatarUrl('');
      setShowAvatarModal(false);
      alert('Avatar updated successfully!');
    } catch (error) {
      console.error('Failed to update avatar:', error);
      alert('Failed to update avatar. Please try again.');
    } finally {
      setAvatarLoading(false);
    }
  };

  const handlePasswordUpdate = async () => {
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      alert('Please fill in all password fields');
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      alert('New password and confirmation do not match');
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      alert('New password must be at least 6 characters long');
      return;
    }

    if (!state.currentUser?.id) {
      alert('User not found. Please sign in again.');
      return;
    }

    setPasswordLoading(true);
    try {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'https://t9ir58i9z9.execute-api.us-east-1.amazonaws.com/dev';
      
      const response = await fetch(`${apiUrl}/update-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: state.currentUser.id,
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update password');
      }

      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
      
      alert('Password updated successfully!');
    } catch (error) {
      console.error('Failed to update password:', error);
      alert(error instanceof Error ? error.message : 'Failed to update password. Please try again.');
    } finally {
      setPasswordLoading(false);
    }
  };

  const togglePasswordVisibility = (field: 'current' | 'new' | 'confirm') => {
    setShowPasswords(prev => ({
      ...prev,
      [field]: !prev[field]
    }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-green-50">
      {/* Header */}
      <header className="bg-white border-b px-4 md:px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button
              onClick={onBack}
              variant="outline"
              size="sm"
              className="border-green-300 text-green-600 hover:bg-green-50"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-green-800">Account Management</h1>
              <p className="text-sm text-green-600">Manage your account settings and preferences</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 md:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Profile Section */}
          <Card className="bg-white">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2 text-green-800">
                <User className="w-5 h-5" />
                <span>Profile Settings</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Avatar Section */}
              <div className="flex items-center space-x-4">
                <div className="relative">
                  <Avatar className="w-16 h-16">
                    <AvatarImage src={state.currentUser?.avatar} alt={state.currentUser?.name} />
                    <AvatarFallback className="bg-gradient-to-r from-green-400 to-green-600 text-white text-lg font-bold">
                      {state.currentUser?.name?.charAt(0).toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <button
                    onClick={() => setShowAvatarModal(true)}
                    className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center hover:bg-green-700 transition-colors"
                    title="Change Avatar"
                  >
                    <Camera className="w-3 h-3" />
                  </button>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800">{state.currentUser?.name || 'User'}</h3>
                  <p className="text-sm text-gray-600">{state.currentUser?.alias || 'No alias set'}</p>
                  <p className="text-xs text-gray-500">@{state.currentUser?.handle || 'no-handle'}</p>
                </div>
              </div>

              {/* User Info */}
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <Input
                    value={state.currentUser?.name || ''}
                    disabled
                    className="bg-gray-50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <Input
                    value={state.currentUser?.alias || ''}
                    disabled
                    className="bg-gray-50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Handle</label>
                  <Input
                    value={state.currentUser?.handle || ''}
                    disabled
                    className="bg-gray-50"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Security Section */}
          <Card className="bg-white">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2 text-green-800">
                <Lock className="w-5 h-5" />
                <span>Security Settings</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
                <div className="relative">
                  <Input
                    type={showPasswords.current ? 'text' : 'password'}
                    value={passwordForm.currentPassword}
                    onChange={(e) => setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                    placeholder="Enter current password"
                  />
                  <button
                    type="button"
                    onClick={() => togglePasswordVisibility('current')}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPasswords.current ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                <div className="relative">
                  <Input
                    type={showPasswords.new ? 'text' : 'password'}
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                    placeholder="Enter new password"
                  />
                  <button
                    type="button"
                    onClick={() => togglePasswordVisibility('new')}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPasswords.new ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
                <div className="relative">
                  <Input
                    type={showPasswords.confirm ? 'text' : 'password'}
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                    placeholder="Confirm new password"
                  />
                  <button
                    type="button"
                    onClick={() => togglePasswordVisibility('confirm')}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPasswords.confirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button
                onClick={handlePasswordUpdate}
                disabled={passwordLoading || !passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword}
                className="w-full bg-green-600 hover:bg-green-700"
              >
                <Save className="w-4 h-4 mr-2" />
                {passwordLoading ? 'Updating...' : 'Update Password'}
              </Button>

              <div className="text-xs text-gray-500">
                <p>Password requirements:</p>
                <ul className="list-disc list-inside mt-1">
                  <li>At least 6 characters long</li>
                  <li>Must match confirmation</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Avatar Edit Modal */}
      {showAvatarModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-green-800">Change Avatar</h3>
              <button
                onClick={() => setShowAvatarModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="text-center">
                <div className="relative inline-block">
                  <Avatar className="w-20 h-20 mx-auto mb-2">
                    <AvatarImage src={newAvatarUrl || state.currentUser?.avatar} alt="Preview" />
                    <AvatarFallback className="bg-gradient-to-r from-green-400 to-green-600 text-white text-xl font-bold">
                      {state.currentUser?.name?.charAt(0).toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <Camera className="w-4 h-4 absolute bottom-0 right-0 bg-green-600 text-white rounded-full p-1" />
                </div>
                <p className="text-sm text-gray-600">Avatar Preview</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Avatar URL
                </label>
                <Input
                  type="url"
                  placeholder="Enter image URL (e.g., https://example.com/avatar.jpg)"
                  value={newAvatarUrl}
                  onChange={(e) => setNewAvatarUrl(e.target.value)}
                  className="w-full"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Enter a valid image URL. Supported formats: JPG, PNG, GIF, WebP
                </p>
              </div>
              
              <div className="flex space-x-3">
                <Button
                  onClick={handleAvatarUpdate}
                  disabled={avatarLoading || !newAvatarUrl.trim()}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  {avatarLoading ? 'Updating...' : 'Update Avatar'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowAvatarModal(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
