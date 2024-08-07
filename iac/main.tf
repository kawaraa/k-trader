terraform {
  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.0"
    }
  }
}

variable "digitalocean_token" {
  sensitive = true
}

provider "digitalocean" {
  token = var.digitalocean_token
}

resource "digitalocean_ssh_key" "auth" {
  name       = "K-Trader VM SSH key"
  public_key = file("${path.module}/id_rsa.pub")
}

# Docs for Digitalocean Resources and droplet Size Slugs: https://slugs.do-api.dev/
# https://registry.terraform.io/providers/digitalocean/digitalocean/latest/docs
resource "digitalocean_droplet" "vm" {
  name   = "k-trader-app"
  region = "ams3"               # fra1, sgp1
  image  = "ubuntu-23-10-x64"   # nodejs
  size   = "s-1vcpu-512mb-10gb" # s-1vcpu-1gb
  # disk     = "25"
  monitoring = true
  # private_networking = true
  ssh_keys = [digitalocean_ssh_key.auth.id]
  tags     = ["trader"]

  provisioner "remote-exec" {
    connection {
      host        = self.ipv4_address
      user        = "root"
      type        = "ssh"
      private_key = file("${path.module}/id_rsa")
    }

    # Update VM
    inline = [
      "sudo systemctl restart do-agent",
      "sleep 10",
      "export DEBIAN_FRONTEND=noninteractive",
      "systemctl daemon-reload",
      "echo VM is ready for SSH connection",
      "apt-get update -y",
      "sleep 10",
    ]

  }
}

resource "digitalocean_project" "trader_project" {
  name        = "K-Trader"
  description = "This projeect represents production resources for K-Trader App."
  purpose     = "Web Application"
  environment = "Production"
  resources   = [digitalocean_droplet.vm.urn]
}

output "droplet_ip" {
  value = digitalocean_droplet.vm.ipv4_address
}
