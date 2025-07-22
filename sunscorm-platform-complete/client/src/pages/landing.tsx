import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sun, BookOpen, Send, BarChart3, Users, Building } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-6 py-16">
        <div className="text-center mb-16">
          <div className="flex items-center justify-center mb-8">
            <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center">
              <Sun className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Welcome to Sun-SCORM
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            The most advanced SCORM dispatch platform. Upload, manage, and distribute 
            your e-learning content with powerful analytics and licensing controls.
          </p>
          <Button 
            size="lg" 
            className="bg-primary hover:bg-blue-700 text-white px-8 py-3 text-lg"
            onClick={() => window.location.href = '/api/login'}
          >
            Get Started
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          <Card className="border-gray-200 hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center mb-4">
                <BookOpen className="w-6 h-6 text-primary" />
              </div>
              <CardTitle className="text-xl">Course Management</CardTitle>
              <CardDescription>
                Upload and manage SCORM 1.2, 2004, AICC, and xAPI content with ease.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-gray-200 hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center mb-4">
                <Send className="w-6 h-6 text-green-600" />
              </div>
              <CardTitle className="text-xl">Smart Dispatch</CardTitle>
              <CardDescription>
                Create licensed packages with user limits, expiration dates, and tracking.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-gray-200 hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="w-12 h-12 bg-purple-50 rounded-lg flex items-center justify-center mb-4">
                <BarChart3 className="w-6 h-6 text-purple-600" />
              </div>
              <CardTitle className="text-xl">Advanced Analytics</CardTitle>
              <CardDescription>
                Track completion rates, user progress, and xAPI statements in real-time.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <Card className="border-gray-200">
            <CardHeader>
              <div className="w-12 h-12 bg-orange-50 rounded-lg flex items-center justify-center mb-4">
                <Users className="w-6 h-6 text-orange-600" />
              </div>
              <CardTitle className="text-xl">Multi-Tenant Support</CardTitle>
              <CardDescription>
                Manage multiple organizations with isolated data and custom licensing.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-gray-200">
            <CardHeader>
              <div className="w-12 h-12 bg-indigo-50 rounded-lg flex items-center justify-center mb-4">
                <Building className="w-6 h-6 text-indigo-600" />
              </div>
              <CardTitle className="text-xl">Enterprise Ready</CardTitle>
              <CardDescription>
                Built for scale with microservices architecture and robust security.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    </div>
  );
}
