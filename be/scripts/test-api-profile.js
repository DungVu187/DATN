const http = require('http');

const loginData = JSON.stringify({
  phone: '0813158383',
  password: '0813158383'
});

const loginOptions = {
  hostname: 'localhost',
  port: 5000,
  path: '/users/admin/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(loginData)
  }
};

const req = http.request(loginOptions, (res) => {
  console.log(`Login Status: ${res.statusCode}`);
  let cookie = '';
  if (res.headers['set-cookie']) {
    cookie = res.headers['set-cookie'][0].split(';')[0];
    console.log(`Cookie received: ${cookie}`);
  }

  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log(`Login Response: ${body}`);

    if (cookie) {
      const profileOptions = {
        hostname: 'localhost',
        port: 5000,
        path: '/users/profile',
        method: 'GET',
        headers: {
          'Cookie': cookie
        }
      };

      const profileReq = http.request(profileOptions, (profileRes) => {
        console.log(`Profile Status: ${profileRes.statusCode}`);
        let profileBody = '';
        profileRes.on('data', chunk => profileBody += chunk);
        profileRes.on('end', () => {
          console.log(`Profile Response: ${profileBody}`);
          process.exit(0);
        });
      });

      profileReq.end();
    } else {
      process.exit(1);
    }
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
  process.exit(1);
});

req.write(loginData);
req.end();
