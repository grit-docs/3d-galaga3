import { App } from './App'
import './styles.css'

const canvas = document.getElementById('game') as HTMLCanvasElement | null
if (!canvas) {
  throw new Error('game canvas not found')
}
const app = new App(canvas)
app.start()
