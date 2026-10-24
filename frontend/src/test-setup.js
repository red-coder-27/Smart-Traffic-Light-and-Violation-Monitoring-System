import { register } from 'node:module'
import React from 'react'

globalThis.React = React

register('./css-loader.js', import.meta.url)
