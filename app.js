var express = require('express');
var app = express();
var http = require('http').createServer(app);
var io = require('socket.io')(http),
    path = require('path'),
    bodyParser = require('body-parser'),
    cookieParser = require('cookie-parser'),
    static = require('serve-static'),
    errorHandler = require('errorhandler'),
    expressErrorHandler = require('express-error-handler'),
    expressSession = require('express-session'),
    ejs = require('ejs'),
    fs = require('fs'),
    hangul = require('hangul-tools'),
    makeHangul = require('hangul-js'),
    url = require('url'), //채팅 모듈
    cors = require('cors'); //ajax 요청시 cors 지원

var dooum = require('./routes/dooumRule').dooum;

app.set('port', process.env.PORT || 3000);
app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(bodyParser.json());
app.use('/public', express.static(__dirname + '/public'));
app.use(cookieParser());
app.use(expressSession({
    secret: 'my key',
    resave: true,
    saveUninitialized: true
}));
app.use(cors());

//사전 DB 생성
let dict = fs.readFileSync('./dict/dict.txt').toString().replace(/\r/g, "").split('\n');

var userId;
var roomId = 1;

var router = express.Router();

//MainPage 라우터
router.route('/').get(function (req, res) {

    if (req.session.user) {
        res.redirect('/process/game');
    } else {
        fs.readFile('./public/index.html', 'utf8', function (error, data) {
            res.send(ejs.render(data, {}));
        });
    }
});

//메인 로그인 라우터
router.route('/process/login').post(function (req, res) {
    userId = req.body.nickname;

    if (req.session.user) {
        res.redirect('/process/game');
    } else {
        if (userId.length < 2) {
            fs.readFile('./public/index.html', 'utf8', function (error, data) {
                res.send(ejs.render(data, {
                    msg: '2글자 이상 입력하세요!'
                }));
            });
        } else if (userId.includes(" ")) {
            fs.readFile('./public/index.html', 'utf8', function (error, data) {
                res.send(ejs.render(data, {
                    msg: '공백은 사용할 수 없어요.'
                }));
            });
        } else if (!usernameValid(userId)) {
            fs.readFile('./public/index.html', 'utf8', function (error, data) {
                res.send(ejs.render(data, {
                    msg: '사용 중인 이름이에요.'
                }));
            });
        } else {
            req.session.user = {
                id: userId,
                authorized: true
            };
            res.redirect('/process/game');
        }
    }
});

//게임 입장 라우터
router.route('/process/game').get(function (req, res) {
    if (req.session.user) {
        //채팅 서버 입장
        fs.readFile('./public/game.html', 'utf8', function (error, data) {
            res.send(ejs.render(data, {
                userId: userId,
                roomId: roomId
            }));
        });
    } else {
        res.redirect('/');
    }
});

//로그아웃 라우터
router.route('/process/logout').get(function (req, res) {
    if (req.session.user) {
        req.session.destroy(function (err) {
            if (err) throw err;
            console.log('세션 삭제하고 로그아웃됨.');
            fs.readFile('./public/index.html', 'utf8', function (error, data) {
                res.send(ejs.render(data, {
                    msg: '로그아웃 되었습니다.'
                }));
            });
        });
    } else {
        res.redirect('/process/game');
    }
});

//게임오버 라우터
router.route('/process/gameover').get(function (req, res) {
    if (req.session.user) {
        req.session.destroy(function (err) {
            if (err) throw err;
            console.log('세션 삭제하고 로그아웃됨.');
            fs.readFile('./public/index.html', 'utf8', function (error, data) {
                res.send(ejs.render(data, {
                    msg: '게임 오버! 다시 입장하세요.'
                }));
            });
        });
    } else {
        res.redirect('/process/game');
    }
});

// 라우터 끝
app.use('/', router);

//로그인 시 중복 이름 검사
function usernameValid(name) {
    for (var i in onUser) {
        for (var j in onUser[i]) {
            if (onUser[i][j] == name) {
                return false;
                break;
            }
        }
    }
    return true;
}

// 404 에러 페이지 처리
var errorHandler = expressErrorHandler({
    static: {
        '404': './public/404.html'
    }
});

app.use(expressErrorHandler.httpError(404));
app.use(errorHandler);


//웹서버 생성
http.listen(app.get('port'),
    function () {
        console.log('express server started with port ' + app.get('port'));
    }
);

//상황에 맞는 초기화가 관건..!
var onUser = []; //room별 user data, cnt는 length로 계산
var userCnt = []; //room별 user count
var userWord = [[], []]; //room 별 userword data
var wordCnt = []; //room 별 word 개수 (첫번째는 3글자인지만 체크)


for (var i = 0; i < 5; i++) {
    onUser[i] = new Array();
}

for (var i = 0; i < 5; i++) {
    userCnt[i] = 0;
}


io.on('connection', function (socket) {

    console.log('[SOCKET.IO] 채팅 서버 연결됨');
    var room;
    var myCnt = 0; //턴 계산 위함
    var user = userId || socket.id;

    socket.on('join', function (data) {
        room = data.roomId;

        socket.join(room);

        if (userCnt[room] < 1 || !userCnt[room]) {
            userCnt[room] = 0;
        }

        //onUser 배열의 userId 중복 막음
        if (!userCheckDup(onUser[room], userId)) {
            console.log("room 유저 삽입됨");

            onUser[room].push(user);

            console.dir(onUser);

            if (user == data.userId) {
                myCnt = userCnt[room];
                console.log(user + "님의 myCnt: " + myCnt);
            }

            ++userCnt[room];
        }

        console.log(user + '님 - [' + room + '] 채팅서버로 join함');
        
        io.sockets.in(room).emit('newUser', user);
        
        io.sockets.in(room).emit('refreshUser', onUser[room]);
    });
    
    socket.on('newgame', function(){
        console.log("SERVER - NEW GAME");
        if (userWord[room]) {
                word_n_cnt_reset(userWord, wordCnt);
        }
    });

    //끝말잇기 답 전송
    socket.on('answer', function (msg) {
        if (wordCnt.length < 1) {
            wordCnt[room] = 0;
        }

        var wordStatus = userWordPush(msg);

        if (wordStatus == 0) {

            var alsoWord = dooum(userWord[room][wordCnt], userWord, room, wordCnt);
            var canWord;
            if (alsoWord.length > 1) {
                canWord = userWord[room][wordCnt[room] - 1].slice(-1) + "(" + alsoWord.slice(-1) + ")";
            } else {
                canWord = userWord[room][wordCnt[room] - 1].slice(-1);
            }

            io.sockets.in(room).emit('answer', user, msg, myCnt, canWord);
            //io.sockets.in(room).emit('turn', next_user);
        } else {
            var warnMsg = "";

            if (wordStatus == 1) {
                warnMsg = "2~3 글자만 입력하세요!";
            } else if (wordStatus == 2) {
                warnMsg = "이미 사용한 단어에요!";
            } else if (wordStatus == 3) {
                warnMsg = "끝말이 아니에요!";
            } else if (wordStatus == 4) {
                warnMsg = "사전에 없는 말이에요!";
            }

            console.log(wordStatus + ': 단어 오류 발생, warnMsg: ' + warnMsg);
            io.sockets.in(room).emit('notice', user, warnMsg);
        }
    });

    //채팅로그 전송
    socket.on('chat', function (msg) {
        io.sockets.in(room).emit('chatmsg', user, msg);
    });

    //유저 0명일때 userWord, wordCnt 초기화 필요
    socket.on('disconnect', function () {
        console.log(user + "님 서버 연결 종료됨");
        
        if (!socket.id) return;

        if (onUser[room]) {
            userDelete(onUser, user);
            --userCnt[room];
        }

        console.log(user + " : 유저 삭제완료");
        console.dir(onUser);

        if (userCnt[room] < 1 || !userCnt[room]) {
            console.log("room 인원 0명 -> 단어 DB 초기화, userCnt: " + userCnt[room]);
            if (userWord[room]) {
                word_n_cnt_reset(userWord, wordCnt);
            }
        }
        io.sockets.in(room).emit('refreshUser', onUser[room]);
        io.sockets.in(room).emit('logout', user);
    });

    function word_n_cnt_reset(uw, wc) {
        uw[room].length = 0; //userWord 초기화
        wc[room] = 0; //wordCnt 초기화
    }

    function userCheckDup(userlist, id) { //onUser[room]으로 넘김
        var check = 0; //0: 중복X
        for (var i in userlist) {
            if (userlist[i] == id) {
                check = 1;
                break;
            }
        }
        return check;
    }

    function userDelete(userlist, id) { //onUser[room]으로 넘김
        for (var i in userlist) {
            if (userlist[room][i] == id) {
                userlist[room].splice(i, 1);
                break;
            }
        }
    }

    //isAnswer 통과하면 단어 추가
    //userWord[roomId][word ++]
    function userWordPush(word) {
        var stat = isAnswer(word);
        if (stat == 0) { //통과
            //단어 추가
            userWord[room][wordCnt[room]] = word;

            console.log("userWord 추가완료 : " + userWord[room][wordCnt[room]]);

            ++wordCnt[room]; //단어 cnt 증가
            return stat;

        } else { //불통과
            return stat;
        }
    }

    function isAnswer(word) {
        //3글자인지 -> 썼던 말인지 -> 끝말인지 -> 사전에 있는지
        var ansCheck = 0; // 0이면 통과
        var cnt = wordCnt[room];
        console.log("wordcount: " + cnt);

        if (word.length > 3 || word.length < 2) {
            ansCheck = 1;
            return ansCheck;
        }

        if (isAnswerUsed(word) == 1) {
            ansCheck = 2;
            return ansCheck;
        }

        if (cnt > 0) { //두음법칙 적용해야함..
            if (isAnswerFinalword(word) == 1) {
                ansCheck = 3;
                return ansCheck;
            }
        }

        if (isAnswerInDict(word) == 1) {
            ansCheck = 4;
            return ansCheck;
        }

        return ansCheck;
    }

    function isAnswerUsed(word) {
        var check = 0; //0이면 통과
        for (var i in userWord[room]) {
            if (userWord[room][i].includes(word)) {
                check = 1;
                break;
            }
        }
        return check;
    }


    function isAnswerFinalword(word) {
        var check = 1; //0이면 통과
        var alsoWord = dooum(word, userWord, room, wordCnt); //이전 단어 두음적용
        if (alsoWord.length > 1) { //두음법칙 대상인 경우
            if (alsoWord.slice(-1) === word.charAt(0)) {
                check = 0;
            }
            //신규 단어(word) 첫말 = 이전 단어 끝말 체크
            if (userWord[room][wordCnt[room] - 1].slice(-1) === word.charAt(0)) {
                check = 0;
            }

        } else { //두음법칙 대상아닌 경우
            if (userWord[room][wordCnt[room] - 1].slice(-1) === word.charAt(0)) {
                check = 0;
            }
        }

        return check;
    }

    function isAnswerInDict(word) {
        var check = 1; //0이면 통과
        for (var i in dict) {
            if (dict[i] == word) {
                check = 0;
                break;
            }
        }

        return check;
    }
});
