import React from 'react';
import { Link } from 'react-router-dom';
import { Home, ArrowLeft } from 'lucide-react';

const NotFound = () => {
    // Log the 404 error in development mode
    React.useEffect(() => {
        if (process.env.NODE_ENV === 'development') {
            console.log('404: Page not found', {
                url: window.location.pathname,
                timestamp: new Date().toISOString()
            });
        }
    }, []);

    return (
        <div
            className="min-h-screen flex items-center justify-center bg-gray-100"
            role="main"
            aria-label="404 Page Not Found"
        >
            <div className="text-center p-8 max-w-md">
                <h1
                    className="text-9xl font-bold text-gray-300"
                    role="heading"
                    aria-level="1"
                >
                    404
                </h1>
                <h2
                    className="text-3xl font-semibold text-gray-700 mt-4"
                    role="heading"
                    aria-level="2"
                >
                    Page Not Found
                </h2>
                <p className="text-gray-500 mt-2">
                    The page you're looking for doesn't exist.
                </p>
                <div className="mt-6 flex flex-col sm:flex-row gap-4 justify-center">
                    <Link
                        to="/"
                        className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                        aria-label="Go to home page"
                    >
                        <Home className="w-4 h-4 mr-2" />
                        Go Home
                    </Link>
                    <button
                        onClick={() => window.history.back()}
                        className="inline-flex items-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                        aria-label="Go back to previous page"
                    >
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Go Back
                    </button>
                </div>
            </div>
        </div>
    );
};

export default NotFound;