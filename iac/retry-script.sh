#!/bin/bash

# This function expect the fist argument to be a (number of retries) 
retry_command() {
  local retries=$1
  shift
  local count=0
  # (until "$@") runs the command given as arguments to the function, if the command succeeds ends the loop
  until "$@"; do
    count=$((count + 1))
    if [ $count -lt $retries ]; then
      echo ""
      echo "[!!!] >>> failed '$*' Waiting for the next try"
      echo ""
      sleep 20 # Pauses the script for 3 seconds before retrying
    else
      # All retries have been exhausted. ($?) holds the exit status of the last executed command within the function
      return $?
    fi
  done
  return 0 
}

# Function to check and install a program, execute additional command if not installed
check_and_install() {
  PROGRAM_NAME=$1
  INSTALL_COMMAND=$2

 if which $PROGRAM_NAME > /dev/null 2>&1; then
    echo "$PROGRAM_NAME is already installed!"
  else
    retry_command 3 apt install $PROGRAM_NAME -y
    retry_command 3 $INSTALL_COMMAND # Execute additional command
    echo "$PROGRAM_NAME is now installed."
  fi
}

# $* contains the args as string
if [[ "$*" != *"init-setup"* ]]; then
  retry_command $@
else
  echo "No arguments were passed, then will setup the server"

  sudo su -
  export DEBIAN_FRONTEND=noninteractive

  #  === Install program if missing === #

  # Install Node.js and NPM
  node -v || curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  # curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sleep 5
  retry_command 3 apt install nodejs -y
  sleep 5
  retry_command 3 apt install npm -y
  which pm2 > /dev/null 2>&1 || npm install -g pm2@latest

  # apt autoremove

  # Install NGINX server and configure/setup the firewall
  mkdir -p /etc/ssl/cloudflare
  cp ~/cloudflare.crt /etc/ssl/cloudflare/cloudflare.crt
  cp ~/cloudflare.key /etc/ssl/cloudflare/cloudflare.key
  sudo chmod 600 /etc/ssl/cloudflare/cloudflare.key
  sudo chmod 644 /etc/ssl/cloudflare/cloudflare.crt
  
  check_and_install "nginx" "systemctl start nginx"
  cp ~/iac/nginx/nginx.conf /etc/nginx/nginx.conf
  cp ~/iac/nginx/default-server.conf /etc/nginx/sites-available/default


  ufw allow 'Nginx HTTP' 
  ufw allow 'Nginx HTTPS'
  ufw allow ssh
  ufw enable

  # 1. ssh-keygen -t ed25519 -C "your_email@example.com"
  # 2. Add Deploy key in https://github.com/kawaraa/k-trader/settings/keys 
  # 3. Clone the repository

  # Additional commands for application setup
  rm -f ~/.pm2/logs/*
  npm install --production
  NODE_ENV=production pm2 restart app --update-env || NODE_ENV=production pm2 start main.js --name app --update-env
  pm2 save # save the current PM2 process list to ensure that your application restarts on boot
  sudo pm2 startup # Generate Startup Script so it restarts on boot
  systemctl restart nginx
fi

# # Fix for running error ##
# sudo npm cache clean --force
# sudo rm -rf /usr/lib/node_modules/pm2
# sudo npm uninstall -g pm2
# sudo npm install -g pm2@latest