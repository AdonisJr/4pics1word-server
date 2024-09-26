// const io = require('socket.io')(3001, {
//     cors: {
//         origin: ['*']
//     }
// });

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: '*', // Allow all origins for testing; change this to your specific domain in production
        methods: ['GET', 'POST'],
        credentials: true // Enable if you need to pass credentials
    }
});


let rooms = {}; // Object to store room data with users
const users = [];
const questions = [
    {
        img: '/1.png',
        answer: 'hanay',
        id: '1',
    },
    {
        img: '/2.png',
        answer: 'kahel',
        id: '2',
    },
    {
        img: '/3.png',
        answer: 'kalbo',
        id: '3',
    },
    {
        img: '/4.png',
        answer: 'kalikasan',
        id: '4',
    },
    {
        id: '5',
        img: '/5.png',
        answer: 'bayani',
    },
]

let isCurrentRoundDone = true;

const scores = [];

const getUsersInRoom = (roomName) => {
    const socketIDsInRoom = rooms[roomName] || [];
    return users.filter(user => socketIDsInRoom.includes(user.id));
};

io.on('connection', socket => {

    socket.on('new-user', (name, cb) => {
        users.push({ id: socket.id, name: name, score: 0 })
        cb(socket.id)
        // Emit the updated list of connected users to all clients
        io.emit('update-user-list', Object.values(users));
    })

    console.log('A user connected:', socket.id);

    // Handle joining a room
    socket.on('join-room', (roomName, message) => {
        socket.join(roomName); // Join the specified room
        if (!rooms[roomName]) {
            rooms[roomName] = [];
        }
        // Add the user to the room with their socket ID and name
        rooms[roomName].push(socket.id);
        message(`You joined ${roomName}`)

        scores.push({ id: socket.id, score: 0 })

        // get users inside room
        const usersInRoom = getUsersInRoom(roomName);
        const userJoined = users.find(user => user.id === socket.id);

        // Emit the updated list of users in the room to all clients in the room
        io.in(roomName).emit('update-user-list-room', usersInRoom);
        io.in(roomName).emit('main-message', `${userJoined.name} join the room` );
        io.in(roomName).emit('all-user-score', getScoresInRoom(roomName));
    });

    // leave room
    socket.on('leave-room', (roomName, message) => {
        // Check if the room exists
        if (!rooms[roomName]) {
            return message('Room not found');
        }

        // Find the user who is leaving based on their socket ID
        const userLeaving = users.find(user => user.id === socket.id);

        // Remove the user's socket ID from the room
        rooms[roomName] = rooms[roomName].filter(id => id !== socket.id);

        // If the user was found, proceed with further actions
        if (userLeaving) {
            // Notify the leaving user
            message('You left the room');

            // Remove the user from the room
            socket.leave(roomName);

            const scoreIndex = scores.findIndex(score => score.id === socket.id);
            console.log({ scoreindex: scoreIndex })
            console.log(scores)
            if (scoreIndex !== -1) {
                scores.splice(scoreIndex, 1);
            }

            // Broadcast to the room that the user has left
            io.in(roomName).emit('main-message', `${userLeaving.name} left the room`);

            // Get the updated list of users in the room
            const usersInRoom = getUsersInRoom(roomName);
            io.in(roomName).emit('update-user-list-room', usersInRoom);

            // If the room is empty, delete it
            if (rooms[roomName].length === 0) {
                delete rooms[roomName];
            }
        }
    });

    socket.on('message', data => {
        const sender = users.find(user => user.id === socket.id);
        io.in(data.roomName).emit('conversation', { id: socket.id, name: sender.name, message: data.message })
    })

    socket.on('send-question', (data, cb) => {
        // Find the question object with the matching id
        const question = questions.find(q => q.id === data.id);

        if (question) {
            isCurrentRoundDone = false;
            // Emit the url and answer to the clients in the specified room
            io.in(data.roomName).emit('question', {
                url: question.img,
                answer: question.answer,
            });
        } else {
            cb(`Question with id "${data.id}" not found.`)
            console.log(`Question with id ${data.id} not found.`);
        }
    });


    // Handle incoming answers

    // Handle incoming answers
    socket.on('send-answer', (data, cb) => {
        if (!isCurrentRoundDone) {
            if (data.answer === data.providedAnswer) {
                // Find the player in the scores array
                const playerScore = scores.find(score => score.id === socket.id);

                if (playerScore) {
                    // Update existing player's score
                    playerScore.score += 10; // Add points for a correct answer (adjust as needed)
                } else {
                    // Add new player to scores array
                    scores.push({ id: socket.id, score: 10 }); // Start with 10 points for a correct answer
                }

                // Mark the round as done
                isCurrentRoundDone = true;
                // Optionally send a success response back to the client
                cb({ success: true, message: 'Correct answer!', score: getPlayerScore(socket.id) });
                io.in(data.roomName).emit('player-correct-answer', getPlayerScore(socket.id))
                socket.emit('get-correct-answer', getPlayerScore(socket.id))
                io.in(data.roomName).emit('all-user-score', getScoresInRoom(data.roomName))
                // socket.emit('get-player-scores', scores)
                io.in(data.roomName).emit('get-player-scores', scores)
            } else {
                // Optionally send a failure response back to the client
                cb({ success: false, message: 'Incorrect answer.' });
            }
            console.log(scores)
        }
    });

    function getPlayerScore(userId) {
        const playerScore = scores.find(score => score.id === userId);
        const playerName = users.find(user => user.id === userId)?.name || 'Unknown Player';
        return {
            score: playerScore ? playerScore.score : 0,
            name: playerName
        };
    }

    const getScoresInRoom = (roomName) => {
        const socketIDsInRoom = rooms[roomName] || [];
        return socketIDsInRoom.map(id => {
            const user = users.find(user => user.id === id);
            const scoreEntry = scores.find(score => score.id === id);
            return {
                id: id,
                name: user ? user.name : 'Unknown User', // Use the user's name or default to 'Unknown User'
                score: scoreEntry ? scoreEntry.score : 0 // Use the user's score or default to 0
            };
        });
    };



    socket.on('add-score', (score, cb) => {
        cb({ type: "score", id: socket.id, score: score })
    })

    socket.on('view-score', score => {
        console.log({ viewscore: scores })
    })

    // Handle user disconnecting
    socket.on('disconnect', () => {
        socket.emit('user-disconnected', users[socket.id])
        // delete users[socket.id]
        const index = users.findIndex(user => user.id === socket.id);
        if (index !== -1) {
            users.splice(index, 1);
        }

        // Remove the user's score from the scores array
        const scoreIndex = scores.findIndex(score => score.id === socket.id);
        if (scoreIndex !== -1) {
            scores.splice(scoreIndex, 1);
        }
        for (const roomName in rooms) {
            rooms[roomName] = rooms[roomName].filter(user => user.id !== socket.id);
            // Emit the updated list of users to the room
            io.in(roomName).emit('update-user-list', rooms[roomName]);
            console.log({ score: scores[socket.id] })
            const usersInRoom = getUsersInRoom(roomName);
            io.in(roomName).emit('update-user-list-room', usersInRoom);
            // If the room is empty, delete it
            if (rooms[roomName].length === 0) {
                delete rooms[roomName];
            }
        }
        console.log(`User ${socket.id} disconnected`);
    });
})

// Start the server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});