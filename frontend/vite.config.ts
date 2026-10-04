import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { localPhonePlugin } from './local/phone-server.mjs'

export default defineConfig({ plugins: [react(), localPhonePlugin()], base: './' })
