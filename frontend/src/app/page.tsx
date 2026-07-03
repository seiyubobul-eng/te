'use my-client'; // We can use standard react hooks
'use client';

import Link from 'next/link';
import { Shield, HardDrive, Lock } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Home() {
  return (
    <div className="relative min-height-screen min-h-screen w-full bg-gray-950 flex flex-col justify-center items-center px-4 overflow-hidden">
      {/* Background Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-blue-500/10 blur-[120px] pointer-events-none animate-pulse-slow"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-purple-500/10 blur-[120px] pointer-events-none animate-pulse-slow"></div>

      {/* Main Card */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-lg glass-premium p-8 rounded-2xl shadow-2xl flex flex-col items-center text-center gap-6"
      >
        <div className="w-16 h-16 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
          <HardDrive className="w-8 h-8 text-blue-400" />
        </div>

        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Node-X Private Drive
          </h1>
          <p className="text-gray-400 text-sm max-w-md">
            This is a secure, private cloud drive. Unauthorized access is strictly prohibited. Only shared links are accessible.
          </p>
        </div>

        <div className="w-full h-[1px] bg-white/5 my-2"></div>

        <div className="flex flex-col items-center gap-3 w-full">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-400 bg-blue-500/5 border border-blue-500/10 px-3 py-1.5 rounded-full">
            <Shield className="w-3.5 h-3.5" />
            <span>Admin Controlled Storage</span>
          </div>
          
          <Link href="/login" className="mt-4 w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-[0.99]">
            <Lock className="w-4 h-4" />
            <span>Enter Console</span>
          </Link>
        </div>
      </motion.div>

      {/* Footer */}
      <div className="absolute bottom-6 text-xs text-gray-500 font-medium">
        Credit by tiaarah
      </div>
    </div>
  );
}
