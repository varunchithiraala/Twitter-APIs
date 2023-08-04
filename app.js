const express = require("express");
const {open} = require("sqlite");
const sqlite3 = require("sqlite3");

const path = require("path");
const dbPath = path.join(__dirname, "twitterClone.db");

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

let db = null;

const initializeDBAndServer = async () => {
    try {
            db = await open({
            filename: dbPath,
            driver: sqlite3.Database
        });
        app.listen(3000, () => 
            console.log("Server Running at http://localhost:3000/"
        ));
    } catch(e) {
        console.log(`DB Error: ${e.message}`);
        process.exit(1);
    } 
};

initializeDBAndServer();

//Authenticate Token 
const authenticateToken = (request,response,next) => {
    let jwtToken;
    const authHeader = request.headers["authorization"];
    if (authHeader !== undefined) {
        jwtToken = authHeader.split(" ")[1];
    } 
    if (jwtToken === undefined) {
        response.status(401);
        response.send("Invalid JWT Token");
    } else {
        jwt.verify(jwtToken, "THE_SECRET_KEY", (error, payload) => {
            if (error) {
                response.status(401);
                response.send("Invalid JWT Token");
            } else {
                request.username = payload.username;
                next();
            }
        });
    }
};

//Following People Ids
const getFollowingPeopleIdsOfUser = async (username) => {
    const getFollowingUsersIdsQuery = `
    SELECT
      following_user_id
    FROM
      follower INNER JOIN user ON user.user_id = follower.follower_user_id
    WHERE
      user.username = '${username}';`;
    const followingPeopleDetails = await db.all(getFollowingUsersIdsQuery);
    const followingPeopleIdsArray = followingPeopleDetails.map(
      (eachUser) => eachUser.following_user_id
    );
    return followingPeopleIdsArray;
};

//Register User API-1
app.post("/register/", async (request, response) => {
    const {username, password, name, gender} = request.body;
    const selectUserQuery = `
    SELECT
      *
    FROM
      user
    WHERE
      username = '${username}';`;
    const userDbDetails = await db.get(selectUserQuery);
    if (userDbDetails === undefined) {
        if (password.length < 6) {
            response.status(400);
            response.send("Password is too short");
        } else {
            const hashedPassword = await bcrypt.hash(password, 10);
            const createUserQuery = `
            INSERT INTO
              user (username, password, name, gender)
            VALUES (
                '${username}',
                '${hashedPassword}',
                '${name}',
                '${gender}');`;
            await db.run(createUserQuery);
            response.send("User created successfully");
        }
    } else {
        response.status(400);
        response.send("User already exists");
    }
});

//Login User API-2
app.post("/login/", async (request, response) => {
    const {username, password} = request.body;
    const selectUserQuery = `
    SELECT
      *
    FROM
      user 
    WHERE
      username = '${username}';`;
    const userDbDetails = await db.get(selectUserQuery);
    if (userDbDetails === undefined) {
        response.status(400);
        response.send("Invalid user");
    } else {
        isPasswordMatched = await bcrypt.compare(password,userDbDetails.password);
        if (isPasswordMatched) {
            const payload = {
                username: username,
                userId: userDbDetails.user_id
            };
            const jwtToken = jwt.sign(payload, "THE_SECRET_KEY");
            response.send({jwtToken});
        } else {
            response.status(400);
            response.send("Invalid password");
        }
    }
});

//Get Following Users Tweets API-3
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
    const {username} = request;
    const followingUsersIds = await getFollowingPeopleIdsOfUser(username);
    const getTweetsQuery = `
    SELECT
      username,
      tweet,
      date_time AS dateTime
    From
      user INNER JOIN tweet ON user.user_id = tweet.user_id
    WHERE
      user.user_id IN (${followingUsersIds})
    ORDER BY 
      date_time DESC
    LIMIT 4;`;
    const followingUsersTweets = await db.all(getTweetsQuery);
    response.send(followingUsersTweets);
});

//Get User Following Users API-4
app.get("/user/following/", authenticateToken, async (request, response) => {
    const {username} = request;
    const getUserQuery = `
    SELECT
      user_id AS userId
    FROM 
      user
    WHERE
      username = '${username}';`;
    const userDetails = await db.get(getUserQuery);
    const {userId} = userDetails;
    const getFollowingUsersQuery = `
    SELECT
      name
    FROM
      follower INNER JOIN user ON user.user_id = follower.following_user_id
    WHERE
      follower_user_id = ${userId};`;
    const followingUsersArray = await db.all(getFollowingUsersQuery);
    response.send(followingUsersArray);
});

//Get User Followers API-5
app.get("/user/followers/", authenticateToken, async (request, response) => {
    const {username} = request;
    const getUserQuery = `
    SELECT
      user_id AS userId
    FROM 
      user
    WHERE
      username = '${username}';`;
    const userDetails = await db.get(getUserQuery);
    const {userId} = userDetails;
    const getUserFollowersQuery = `
    SELECT
      name
    FROM
      follower INNER JOIN user ON user.user_id = follower.follower_user_id
    WHERE
      following_user_id = ${userId};`;
    const userFollowersArray = await db.all(getUserFollowersQuery);
    response.send(userFollowersArray);
});

//Get User Request Tweet API-6
app.get("/tweets/:tweetId/", authenticateToken, async(request, response) => {
    const {tweetId} = request.params;
    const {username} = request;
    const getUserQuery = `
    SELECT
      user_id AS userId
    FROM 
      user
    WHERE
      username = '${username}';`;
    const userDetails = await db.get(getUserQuery);
    const {userId} = userDetails;
    const getFollowerQuery = `
    SELECT
      following_user_id
    FROM
      follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id
    WHERE
      follower_user_id = ${userId}
      AND tweet.tweet_id = ${tweetId};`;
    const followerDetails = await db.get(getFollowerQuery);
    if (followerDetails === undefined) {
        response.status(401);
        response.send("Invalid Request");
    } else {
        const getTweetQuery = `
        SELECT 
          tweet,
          (SELECT COUNT() FROM like WHERE tweet_id = ${tweetId}) AS likes,
          (SELECT COUNT() FROM reply WHERE tweet_id = ${tweetId}) AS replies,
          date_time AS dateTime
        FROM 
          tweet
        WHERE 
          tweet.tweet_id = ${tweetId};`;
        const requestTweet = await db.get(getTweetQuery);
        response.send(requestTweet);
    }
});

//Get User Request Tweet Likes API-7
app.get("/tweets/:tweetId/likes/", authenticateToken, async (request, response) => {
    const {tweetId} = request.params;
    const {username} = request;
    const getUserQuery = `
    SELECT
      user_id AS userId
    FROM 
      user
    WHERE
      username = '${username}';`;
    const userDetails = await db.get(getUserQuery);
    const {userId} = userDetails;
    const getFollowerQuery = `
    SELECT
      follower.following_user_id
    FROM
      follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id
    WHERE
      follower.follower_user_id = ${userId}
      AND tweet.tweet_id = ${tweetId};`;
    const followerDetails = await db.get(getFollowerQuery);
    if (followerDetails === undefined) {
        response.status(401);
        response.send("Invalid Request");
    } else {
        const getTweetQuery = `
        SELECT
          username
        FROM
          like INNER JOIN user ON like.user_id = user.user_id
        WHERE
          tweet_id = ${tweetId};`;
        const tweetsArray = await db.all(getTweetQuery);
        let usersArray = [];
        tweetsArray.map((eachUser) =>
            usersArray.push(eachUser.username)
        );
        response.send({likes: usersArray});
    }
});

//Get User Request Tweet Replies API-8
app.get("/tweets/:tweetId/replies/", authenticateToken, async(request, response) => {
    const {tweetId} = request.params;
    const {username} = request;
    const getUserQuery = `
    SELECT
      user_id AS userId
    FROM 
      user
    WHERE
      username = '${username}';`;
    const userDetails = await db.get(getUserQuery);
    const {userId} = userDetails;
    const getFollowerQuery = `
    SELECT
      follower.following_user_id
    FROM
      follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id
    WHERE
      follower.follower_user_id = ${userId}
      AND tweet.tweet_id = ${tweetId};`;
    const followerDetails = await db.get(getFollowerQuery);
    if (followerDetails === undefined) {
        response.status(401);
        response.send("Invalid Request");
    } else {
        const getTweetQuery = `
        SELECT
          name, reply
        FROM
          user INNER JOIN reply ON user.user_id = reply.user_id
        WHERE
          tweet_id = ${tweetId};`;
        const tweetsArray = await db.all(getTweetQuery);
        let usersArray = [];
        tweetsArray.map((eachUser) =>
            usersArray.push({name: eachUser.name,reply: eachUser.reply})
        );
        response.send({replies: usersArray});
    }
});

//Get User Tweets API-9
app.get("/user/tweets/", authenticateToken, async (request, response) => {
    const {username} = request;
    const getUserQuery = `
    SELECT
      user_id AS userId
    FROM 
      user
    WHERE
      username = '${username}';`;
    const userDetails = await db.get(getUserQuery);
    const {userId} = userDetails;
    const getTweetQuery = `
        SELECT 
          likeTweet.tweet AS tweet, 
          COUNT(DISTINCT likeTweet.like_id)as likes ,
          COUNT(DISTINCT reply.reply_id) as replies,
          likeTweet.date_time as dateTime
        FROM 
          (tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id) AS likeTweet
          INNER JOIN reply ON likeTweet.tweet_id = reply.tweet_id
        WHERE 
          likeTweet.user_id = ${userId}
        GROUP BY
          likeTweet.tweet_id;`;
        const requestTweet = await db.all(getTweetQuery);
        response.send(requestTweet);
});

//Post User Tweets API-10
app.post("/user/tweets/", authenticateToken, async (request, response) => {
    const {username} = request;
    const {tweet} = request.body;
    const getUserQuery = `
    SELECT
      user_id AS userId
    FROM 
      user
    WHERE
      username = '${username}';`;
    const userDetails = await db.get(getUserQuery);
    const {userId} = userDetails;
    const addTweetQuery = `
    INSERT INTO
      tweet (tweet, user_id)
    VALUES (
        '${tweet}',
         ${userId}
    );`;
    await db.run(addTweetQuery);
    response.send("Created a Tweet");
});

//Delete User Tweet API-11
app.delete("/tweets/:tweetId/", authenticateToken, async (request, response) => {
    const {username} = request;
    const {tweetId} = request.params;
    const getUserQuery = `
    SELECT
      user_id AS userId
    FROM 
      user
    WHERE
      username = '${username}';`;
    const userDetails = await db.get(getUserQuery);
    const {userId} = userDetails;
    const userTweetQuery = `
    SELECT
      *
    FROM
      user INNER JOIN tweet on user.user_id = tweet.user_id
    WHERE
      tweet.tweet_id = ${tweetId}
      AND user.user_id = ${userId};`;
    const tweetDetails = await db.get(userTweetQuery);
    if (tweetDetails === undefined) {
        response.status(401);
        response.send("Invalid Request");
    } else {
        const deleteTweetQuery = `
        DELETE FROM
          tweet
        WHERE
          tweet_id = ${tweetId};`;
        await db.run(deleteTweetQuery);
        response.send("Tweet Removed");
    }
});

module.exports = app;