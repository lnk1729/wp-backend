const functions = require("firebase-functions");
const app = require("express")();
const FBAuth = require("./util/fbAuth");

const { db } = require("./util/admin");

const {
  GetAllPosts,
  AddPost,
  GetPost,
  AddComment,
  LikePost,
  UnlikePost,
  DeletePost
} = require("./handlers/posts");
const {
  signup,
  login,
  uploadImage,
  addUserDetails,
  getAuthenticatedUser,
  GetUserDetails,
  MarkNotificationsRead
} = require("./handlers/users");

// Post-related endpoints
app.get("/posts", GetAllPosts);
app.post("/post", FBAuth, AddPost);
app.get("/post/:postId", GetPost);
app.delete("/post/:postId", FBAuth, DeletePost);
app.post("/post/:postId/comment", FBAuth, AddComment);
app.get("/post/:postId/like", FBAuth, LikePost);
app.get("/post/:postId/unlike", FBAuth, UnlikePost);

// Authentication endpoints
app.post("/signup", signup);
app.post("/login", login);

// Profile endpoints
app.post("/user/image", FBAuth, uploadImage);
app.post("/user", FBAuth, addUserDetails);
app.get("/user", FBAuth, getAuthenticatedUser);
app.get("/user/:handle", GetUserDetails);
app.post("/notifications", MarkNotificationsRead);

exports.api = functions.https.onRequest(app);

// Notification functions

exports.CreateNotificationOnLike = functions.firestore
  .document("likes/{id}")
  .onCreate(snapshot => {
    return db
      .doc(`/posts/${snapshot.data().postId}`)
      .get()
      .then(doc => {
        if (
          doc.exists &&
          doc.data().userHandle !== snapshot.data().userHandle
        ) {
          return db.doc(`/notifications/${snapshot.id}`).set({
            createdAt: new Date().toISOString(),
            postId: doc.id,
            recipient: doc.data().userHandle,
            sender: snapshot.data().userHandle,
            type: "like",
            read: "false"
          });
        }
      })
      .catch(err => {
        console.error(err);
      });
  });

exports.DeleteNotificationOnUnlike = functions.firestore
  .document("likes/{id}")
  .onDelete(snapshot => {
    return db
      .doc(`/notifications/${snapshot.id}`)
      .delete()
      .catch(err => {
        console.error(err);
        return;
      });
  });

exports.CreateNotificationOnComment = functions.firestore
  .document("comments/{id}")
  .onCreate(snapshot => {
    return db
      .doc(`/posts/${snapshot.data().postId}`)
      .get()
      .then(doc => {
        if (
          doc.exists &&
          doc.data().userHandle !== snapshot.data().userHandle
        ) {
          return db.doc(`/notifications/${snapshot.id}`).set({
            createdAt: new Date().toISOString(),
            postId: doc.id,
            recipient: doc.data().userHandle,
            sender: snapshot.data().userHandle,
            type: "comment",
            read: "false"
          });
        }
      })
      .catch(err => {
        console.error(err);
        return;
      });
  });

exports.OnUserImgChange = functions.firestore
  .document("/users/{userId}")
  .onUpdate(change => {
    const batch = db.batch();
    if (change.before.data().imgUrl !== change.after.data().imgUrl) {
      return db
        .collection("posts")
        .where("userHandle", "==", change.before.data().handle)
        .get()
        .then(data => {
          data.forEach(doc => {
            const post = db.doc(`/posts/${doc.id}`);
            batch.update(post, { userImage: change.after.data().imgUrl });
          });
          return batch.commit();
        });
    } else {
      return true;
    }
  });

exports.OnPostDelete = functions.firestore
  .document("/posts/{postId}")
  .onDelete((snapshot, context) => {
    const postId = context.params.postId;
    const batch = db.batch();
    return db
      .collection("comments")
      .where("postId", "==", postId)
      .get()
      .then(data => {
        data.forEach(doc => {
          batch.delete(db.doc(`/comments/${doc.id}`));
        });
        return db
          .collection("likes")
          .where("postId", "==", postId)
          .get();
      })
      .then(data => {
        data.forEach(doc => {
          batch.delete(db.doc(`/likes/${doc.id}`));
        });
        return db
          .collection("notifications")
          .where("postId", "==", postId)
          .get();
      })
      .then(data => {
        data.forEach(doc => {
          batch.delete(db.doc(`/notifications/${doc.id}`));
        });
        return batch.commit();
      })
      .catch(err => {
        console.error(err);
      });
  });
