import React from 'react';
import { X, ArrowLeft } from 'lucide-react';

interface CategoriesPageProps {
  onClose: () => void;
  onSelectCategory?: (category: string) => void;
}

const categories = [
  { name: 'General', color: 'bg-green-400', icon: '💬' },
  { name: 'Relationships', color: 'bg-pink-400', icon: '💕' },
  { name: 'Psychology', color: 'bg-indigo-400', icon: '🧠' },
  { name: 'Marriage', color: 'bg-rose-400', icon: '💑' },
  { name: 'Friendship', color: 'bg-amber-400', icon: '👥' },
  { name: 'Intimacy', color: 'bg-violet-400', icon: '💫' }
];

export const CategoriesPage: React.FC<CategoriesPageProps> = ({ onClose, onSelectCategory }) => {
  const handleCategoryClick = (categoryName: string) => {
    if (onSelectCategory) {
      onSelectCategory(categoryName);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-gray-50 z-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 flex items-center sticky top-0 z-10">
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-100 rounded-lg mr-3"
          aria-label="Go back"
        >
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>
        <h1 className="text-lg font-semibold text-gray-800 flex-1">Categories</h1>
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-100 rounded-lg"
          aria-label="Close"
        >
          <X className="w-5 h-5 text-gray-700" />
        </button>
      </div>

      {/* Categories List */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-4">
          <div className="bg-white rounded-lg shadow-sm">
            {categories.map((category, index) => (
              <button
                key={category.name}
                onClick={() => handleCategoryClick(category.name)}
                className={`w-full flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors ${
                  index !== categories.length - 1 ? 'border-b border-gray-100' : ''
                } ${index === 0 ? 'rounded-t-lg' : ''} ${index === categories.length - 1 ? 'rounded-b-lg' : ''}`}
              >
                {/* Category Icon */}
                <div className={`w-10 h-10 ${category.color} rounded-full flex items-center justify-center text-xl flex-shrink-0`}>
                  {category.icon}
                </div>
                
                {/* Category Name */}
                <span className="text-base font-medium text-gray-800 flex-1 text-left">
                  {category.name}
                </span>
                
                {/* Arrow indicator */}
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

