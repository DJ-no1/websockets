import express from 'express'
import http from 'http'
import { Server } from 'socket.io'

const app = express()
const server = http.createServer(app)
const io = new Server(server)

app.use(express.static('public'))

const history = []
const MAX_HISTORY = 50

io.on('connection', (socket) => {
  console.log('a user connected', socket.id)

  socket.on('join', (user) => {
    socket.username = user
    socket.emit('history', history) // send missed messages to joiner
    socket.broadcast.emit('user_joined', user)
  })

  socket.on('chat_message', (text) => {
    if (!socket.username) return
    const msgData = { sender: socket.username, text }
    
    history.push(msgData)
    if (history.length > MAX_HISTORY) history.shift() // keep array bounded
    
    socket.broadcast.emit('chat_message', msgData)
  })

  socket.on('disconnect', () => {
    console.log('user disconnected', socket.id)
    if (socket.username) {
      socket.broadcast.emit('user_left', socket.username)
    }
  })
})

const PORT = process.env.PORT || 3000
server.listen(PORT, () => console.log(`Server listening on ${PORT}`))
