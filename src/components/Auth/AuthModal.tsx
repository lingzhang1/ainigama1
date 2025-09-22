import React, { useState } from 'react';
import { X, Mail, Lock, User, Eye, EyeOff } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardContent } from '../ui/card';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (user: { id: string; name: string; email: string; avatar: string; handle: string }) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onLogin }) => {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    alias: '',
    password: '',
    confirmPassword: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [isCheckingAlias, setIsCheckingAlias] = useState(false);
  const [aliasAvailable, setAliasAvailable] = useState<boolean | null>(null);

  if (!isOpen) return null;

  // Generate suggested alias from name
  const generateSuggestedAlias = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .substring(0, 15);
  };

  // Check alias availability
  const checkAliasAvailability = async (alias: string) => {
    if (!alias || alias.length < 3) {
      setAliasAvailable(null);
      return;
    }

    setIsCheckingAlias(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
      const response = await fetch(`${apiUrl}/check-alias/${encodeURIComponent(alias)}`);
      const result = await response.json();
      setAliasAvailable(result.available);
    } catch (error) {
      console.error('Failed to check alias availability:', error);
      setAliasAvailable(null);
    } finally {
      setIsCheckingAlias(false);
    }
  };

  // Debounced alias checking
  React.useEffect(() => {
    if (mode === 'signup' && formData.alias) {
      const timer = setTimeout(() => {
        checkAliasAvailability(formData.alias);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [formData.alias, mode]);

  // Auto-suggest alias when name changes
  React.useEffect(() => {
    if (mode === 'signup' && formData.name && !formData.alias) {
      const suggested = generateSuggestedAlias(formData.name);
      setFormData(prev => ({ ...prev, alias: suggested }));
    }
  }, [formData.name, mode]);
  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};

    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    if (mode === 'signup') {
      if (!formData.name) {
        newErrors.name = 'Name is required';
      }
      if (!formData.alias) {
        newErrors.alias = 'Alias is required';
      } else if (formData.alias.length < 3) {
        newErrors.alias = 'Alias must be at least 3 characters';
      } else if (!/^[a-z0-9_]+$/.test(formData.alias)) {
        newErrors.alias = 'Alias can only contain lowercase letters, numbers, and underscores';
      } else if (aliasAvailable === false) {
        newErrors.alias = 'This alias is already taken';
      }
      if (formData.password !== formData.confirmPassword) {
        newErrors.confirmPassword = 'Passwords do not match';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    setIsLoading(true);
    
    // Simulate API call
    setTimeout(() => {
      const user = {
        id: `user-${Date.now()}`,
        name: mode === 'signup' ? formData.name : (formData.name || formData.email.split('@')[0]),
        email: formData.email,
        alias: mode === 'signup' ? formData.alias : generateSuggestedAlias(formData.email.split('@')[0]),
        avatar: '/img-5.svg',
        handle: `@${mode === 'signup' ? formData.alias : generateSuggestedAlias(formData.email.split('@')[0])}`
      };
      
      onLogin(user);
      setIsLoading(false);
      onClose();
    }, 1000);
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md bg-white">
        <CardContent className="p-0">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b">
            <h2 className="text-xl font-semibold text-gray-900">
              {mode === 'login' ? 'Welcome back' : 'Create account'}
            </h2>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {mode === 'signup' && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    type="text"
                    placeholder="Enter your full name"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    className={`pl-10 ${errors.name ? 'border-red-500' : ''}`}
                  />
                </div>
                {errors.name && (
                  <p className="text-sm text-red-600">{errors.name}</p>
                )}
              </div>
            )}

            {mode === 'signup' && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Username
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm">@</span>
                  <Input
                    type="text"
                    placeholder="username"
                    value={formData.alias}
                    onChange={(e) => {
                      const value = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
                      handleInputChange('alias', value);
                      setAliasAvailable(null);
                    }}
                    className={`pl-8 ${errors.alias ? 'border-red-500' : aliasAvailable === true ? 'border-green-500' : aliasAvailable === false ? 'border-red-500' : ''}`}
                    maxLength={20}
                  />
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                    {isCheckingAlias && (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400"></div>
                    )}
                    {!isCheckingAlias && aliasAvailable === true && (
                      <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-xs">✓</span>
                      </div>
                    )}
                    {!isCheckingAlias && aliasAvailable === false && (
                      <div className="w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-xs">✗</span>
                      </div>
                    )}
                  </div>
                </div>
                {errors.alias && (
                  <p className="text-sm text-red-600">{errors.alias}</p>
                )}
                {!errors.alias && aliasAvailable === true && (
                  <p className="text-sm text-green-600">Username is available!</p>
                )}
                {!errors.alias && aliasAvailable === false && (
                  <p className="text-sm text-red-600">Username is already taken</p>
                )}
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  type="email"
                  placeholder="Enter your email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  className={`pl-10 ${errors.email ? 'border-red-500' : ''}`}
                />
              </div>
              {errors.email && (
                <p className="text-sm text-red-600">{errors.email}</p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  className={`pl-10 pr-10 ${errors.password ? 'border-red-500' : ''}`}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              {errors.password && (
                <p className="text-sm text-red-600">{errors.password}</p>
              )}
            </div>

            {mode === 'signup' && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="Confirm your password"
                    value={formData.confirmPassword}
                    onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                    className={`pl-10 pr-10 ${errors.confirmPassword ? 'border-red-500' : ''}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                {errors.confirmPassword && (
                  <p className="text-sm text-red-600">{errors.confirmPassword}</p>
                )}
              </div>
            )}

            <Button
              type="submit"
              className="w-full bg-gray-800 hover:bg-gray-700 text-white"
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  {mode === 'login' ? 'Signing in...' : 'Creating account...'}
                </div>
              ) : (
                mode === 'login' ? 'Sign In' : 'Create Account'
              )}
            </Button>
          </form>

          {/* Footer */}
          <div className="px-6 pb-6 text-center">
            <p className="text-sm text-gray-600">
              {mode === 'login' ? "Don't have an account? " : "Already have an account? "}
              <button
                type="button"
                onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
                className="text-gray-800 hover:text-gray-600 font-medium"
              >
                {mode === 'login' ? 'Sign up' : 'Sign in'}
              </button>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};