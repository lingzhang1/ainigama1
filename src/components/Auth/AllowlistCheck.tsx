import React, { useState } from 'react';
import { Shield, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardContent } from '../ui/card';

interface AllowlistCheckProps {
  onApproved: () => void;
}

// Allowlisted emails - in production, this would come from environment variables or API
const getAllowlistedEmails = () => {
  const envEmails = import.meta.env.VITE_ALLOWLIST_EMAILS;
  if (envEmails) {
    return envEmails.split(',').map((email: string) => email.trim().toLowerCase());
  }
  // Fallback emails for development
  return [
    'admin@ainigama.com',
    'beta@ainigama.com',
    'test@ainigama.com',
  ];
};

export const AllowlistCheck: React.FC<AllowlistCheckProps> = ({ onApproved }) => {
  const [email, setEmail] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState('');
  const [isApproved, setIsApproved] = useState(false);

  const checkAllowlist = async () => {
    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }

    setIsChecking(true);
    setError('');

    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check if email is in allowlist
    const allowlistedEmails = getAllowlistedEmails();
    const isAllowed = allowlistedEmails.includes(email.toLowerCase().trim());

    if (isAllowed) {
      setIsApproved(true);
      // Store approval in localStorage for session persistence
      localStorage.setItem('ainigama_allowlist_approved', 'true');
      localStorage.setItem('ainigama_allowlist_email', email);
      setTimeout(() => {
        onApproved();
      }, 1500);
    } else {
      setError('Your email is not on the beta access list. Please contact support for access.');
    }

    setIsChecking(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    checkAllowlist();
  };

  if (isApproved) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Access Approved!
            </h2>
            <p className="text-gray-600 mb-4">
              Welcome to Ainigama Beta. Redirecting you to the application...
            </p>
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-500 mx-auto"></div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardContent className="p-8">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Shield className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Ainigama Beta Access
            </h1>
            <p className="text-gray-600">
              This application is currently in private beta. Please enter your email to verify access.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <Input
                type="email"
                placeholder="Enter your email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={error ? 'border-red-500' : ''}
                disabled={isChecking}
              />
            </div>

            {error && (
              <div className="flex items-center space-x-2 text-red-600 text-sm">
                <AlertCircle className="w-4 h-4" />
                <span>{error}</span>
              </div>
            )}

            <Button
              type="submit"
              className="w-full bg-green-600 hover:bg-green-700 text-white"
              disabled={isChecking}
            >
              {isChecking ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Checking Access...
                </div>
              ) : (
                'Verify Access'
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-500">
              Need access? Contact{' '}
              <a href="mailto:support@ainigama.com" className="text-green-600 hover:text-green-500">
                support@ainigama.com
              </a>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};