FROM python:3.10-slim-bookworm

WORKDIR /app/server

# install ffmpeg
RUN apt-get -y update && apt-get install -y ffmpeg build-essential g++

# downgrade pip
RUN pip install pip==24.0

# install pytorch
RUN pip install torch==2.4.1+cu124 torchvision==0.19.1+cu124 torchaudio==2.4.1+cu124 --index-url https://download.pytorch.org/whl/cu124

# install other dependencies
COPY requirements.txt .
RUN pip install -r requirements.txt