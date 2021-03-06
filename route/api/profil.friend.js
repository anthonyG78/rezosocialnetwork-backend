const router    = require('express').Router();
const Account     = require('../../model/accounts');
const authenticate = require('../../middleware/authenticate');
const Mailer = require('../../lib/Mailer');
const conf       = require('../../conf/conf')[process.env.NODE_ENV || 'production'];

module.exports  = function(app){
    // CHERCHER
    router.get('/search/', (req, res, next) => {
        const query = req.query;

        Account.getFriendsList(req.user._id)
            .then((friends) => {
                const friendsId = friends.map((friend) => {
                    return friend._id;
                });
                
                return Account.searchFriends(friendsId, query.q, parseInt(query.l));
            })
            .then(friends => {
                res.json(friends);
            })
            .catch(err => {
                return next(err);
            });
    });

    // AFFICHER
    // router.get('/', (req, res, next) => {
    //     Account.getFriendsList(req.user._id, false)
    //         .then(friends => {
    //             res.json(friends);
    //         })
    //         .catch(err => {
    //             return next(err);
    //         });
    // });

    // AJOUTER
    router.post('/:id', (req, res, next) => {
        var friendId = req.params.id;
        var userId = req.user._id;

        Account.userExists(friendId)
            .then(friendExists => {
                if(friendExists === false){
                    throw "Cette personne n'existe pas";
                }
                
                return Account.hasFriendshipAlreadyRequested(userId, friendId);
            })
            .then(alreadyRequested => {
                if(alreadyRequested) {
                    throw "Cette personne a déjà été demandée en ami";
                }
                return Account.addFriend(userId, friendId, 0);
            })
            .then(user => {
                return Account.addFriend(friendId, userId, 1)
                    .then((friend) => {
                        let user = null;

                        Account.getById(friendId)
                            .then((_user) => {
                                user = _user;
                                return Account.getById(userId);
                            })
                            .then((sender) => {
                                Mailer.sendMail({
                                    from: conf.nodemailer.auth.user,
                                    to: user.email,
                                    subject: conf.app.name + ' - y a du nouveau !',
                                    html: require('../../views/mailNewNotification')({
                                        title: 'Nouvel ami ?',
                                        notification: ' vous a demandé en ami !',
                                        message: 'Soyons amis :)',
                                        sender: sender,
                                        user: user,
                                        action: {
                                            url: conf.server.domain + '/friend/' + sender.id,
                                            label: 'voir son profil', 
                                        },
                                        app: {
                                            name: conf.app.name,
                                            url: conf.server.domain,
                                        },
                                    }),
                                });
                            });
                        Account.addNotificationFor(friendId, 'friends', userId);
                    });
            })
            .then(friend => {
                res.json({friend: true});
            })
            .catch(err => {
                return next(err);
            });
    });

    // SUPPRIMER
    router.delete('/:id', (req, res, next) => {
        var friendId = req.params.id;
        var userId = req.body.userId || req.user._id;

        Account.userExists(friendId)
            .then(friendExists => {
                if(friendExists === false){
                    throw "Cette personne n'existe pas";
                }

                return Account.removeFriend(userId, friendId);
            })
            .then(user => {
                return Account.removeFriend(friendId, userId);
            })
            .then((friend) => {
                return Account.deleteNotificationFor(userId, 'friends', friendId);
            })
            .then(() => {
                return Account.deleteNotificationFor(friendId, 'friends', userId);
            })
            .then(() => {
                res.json({friend: true});
            })
            .catch(err => {
                return next(err);
            });
    });

    // ACCEPTER
    router.put('/:id/accept/', (req, res, next) => {
        var friendId = req.params.id;
        var userId = req.user._id;

        Account.userExists(friendId)
            .then(friendExists => {
                if(friendExists === false){
                    throw "Cette personne n'existe pas";
                }

                // Friendship in one way (Friend first !)
                return Account.acceptFriend(friendId, userId);
            })
            .then(friends => {
                // Then friendship in both way (Self in second)
                return Account.acceptFriend(userId, friendId);
            })
            // .then(user => {
            //     // Update self data
            //     return authenticate.update(req, user);
            // })
            .then((friends) => {
                Account.getById(friendId)
                    .then((_user) => {
                        user = _user;
                        return Account.getById(userId);
                    })
                    .then((sender) => {
                        Mailer.sendMail({
                            from: conf.nodemailer.auth.user,
                            to: user.email,
                            subject: conf.app.name + ' - y a du nouveau !',
                            html: require('../../views/mailNewNotification')({
                                title: 'Nouvel ami !',
                                notification: ' vous a accepté en ami !',
                                message: 'Nous sommes amis, nous pouvons communiquer ensemble et partager des posts à présent :D',
                                sender: sender,
                                user: user,
                                action: {
                                    url: conf.server.domain + '/friend/' + sender.id,
                                    label: 'voir son profil',
                                },
                                app: {
                                    name: conf.app.name,
                                    url: conf.server.domain,
                                },
                            }),
                        });
                    });
            })
            .then(() => {
                res.json(true);
            })
            .catch(err => {
                return next(err);
            });
    });

    // REFUSER
    router.put('/:id/refuse/', (req, res, next) => {
        var friendId = req.params.id;
        var userId = req.user._id;

        Account.userExists(friendId)
            .then(friendExists => {
                if(friendExists === false){
                    throw "Cette personne n'existe pas";
                }

                return Account.removeFriend(userId, friendId);
            })
            .then(user => {
                return Account.removeFriend(friendId, userId);
            })
            .then((friend) => {
                return Account.deleteNotificationFor(userId, 'friends', friendId);
            })
            .then(() => {
                Account.getById(friendId)
                    .then((_user) => {
                        user = _user;
                        return Account.getById(userId);
                    })
                    .then((sender) => {
                        Mailer.sendMail({
                            from: conf.nodemailer.auth.user,
                            to: user.email,
                            subject: conf.app.name + ' - y a du nouveau !',
                            html: require('../../views/mailNewNotification')({
                                title: 'Refus d\'amitié',
                                notification: ' ne souhaite pas devenir votre ami',
                                message: 'Un de perdu, dix de retrouvés. Il y a d\'autres personnes sur REZO qui méritent votre amitié !',
                                sender: sender,
                                user: user,
                                action: {
                                    url: conf.server.domain,
                                    label: 'aller sur REZO',
                                },
                                app: {
                                    name: conf.app.name,
                                    url: conf.server.domain,
                                },
                            }),
                        });
                    });
            })
            .then(() => {
                res.json(true);
            })
            .catch(err => {
                return next(err);
            });
    });

    return router;
}