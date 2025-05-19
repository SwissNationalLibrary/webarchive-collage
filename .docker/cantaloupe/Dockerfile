FROM eclipse-temurin:21-jdk

ENV CANTALOUPE_VERSION=5.0.7
ENV OPENJPEG_VERSION=2.5.3
ENV CANTALOUPE_USER=cantaloupe
ENV JAVA_HOME=/opt/java/openjdk
ENV PATH=$PATH:${JAVA_HOME}/bin
ENV TZ=Europe/Zurich

ARG DEBIAN_FRONTEND=noninteractive
ARG BUILDPLATFORM
ARG BUILDOS linux
# TARGETPLATFORM: see https://github.com/docker/buildx/issues/510
# linux/amd64
ARG TARGETPLATFORM
ENV TARGETPLATFORM=${TARGETPLATFORM:-linux/amd64}

RUN apt-get update \
  && apt-get install tzdata -y \
  ffmpeg \
  unzip \
  libopenjp2-tools \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

#
# libturbojpeg
#
ENV TURBOJPEG_VERSION 2.1.5.1
#ENV TURBOJPEG_VERSION=3.0.90 <-- does not seem to work
RUN if [ "$TARGETPLATFORM" = "linux/amd64" ]; then ARCH=amd64; elif [ "$TARGETPLATFORM" = "linux/arm64" ]; then ARCH=arm64; else ARCH=amd64; fi \
  && curl -o libjpeg-turbo-official-${TURBOJPEG_VERSION}_${ARCH}.deb -OL --silent https://github.com/libjpeg-turbo/libjpeg-turbo/releases/download/${TURBOJPEG_VERSION}/libjpeg-turbo-official_${TURBOJPEG_VERSION}_${ARCH}.deb \
  && dpkg -i libjpeg-turbo-official-${TURBOJPEG_VERSION}_${ARCH}.deb \
  && rm -f libjpeg-turbo-official-${TURBOJPEG_VERSION}_${ARCH}.deb \
  && ln -s /opt/libjpeg-turbo/lib64 /opt/libjpeg-turbo/lib

#
# grok jp2 (debian releases)
# >=7.6.6 needs libperl5.32 (=> ubuntu 21.04 / debian 11)
#
#ENV DEBIAN_PACKAGES=https://packages.debian.org/
#RUN if [ "$TARGETPLATFORM" = "linux/amd64" ]; then ARCH=amd64; elif [ "$TARGETPLATFORM" = "linux/arm64" ]; then ARCH=arm64; else ARCH=amd64; fi \
#    && curl -OL --silent https://debian.ethz.ch/debian/pool/main/libg/libgrokj2k/libgrokj2k1_${GROK_RELEASE}_${ARCH}.deb \
#    && curl -OL --silent https://debian.ethz.ch/debian/pool/main/libg/libgrokj2k/grokj2k-tools_${GROK_RELEASE}_${ARCH}.deb \
#    && dpkg -i --ignore-depends=libjpeg62-turbo ./libgrokj2k1_${GROK_RELEASE}_${ARCH}.deb \
#    && dpkg -i --ignore-depends=libjpeg62-turbo ./grokj2k-tools_${GROK_RELEASE}_${ARCH}.deb \
#    && rm -f libgrokj2k1_${GROK_RELEASE}-1_${ARCH}.deb grokj2k-tools_${GROK_RELEASE}_${ARCH}.deb
#

#
# Cantaloupe
#
WORKDIR /tmp
RUN curl -OL https://github.com/cantaloupe-project/cantaloupe/releases/download/v$CANTALOUPE_VERSION/Cantaloupe-$CANTALOUPE_VERSION.zip \
  && mkdir -p /usr/local/ \
  && cd /usr/local \
  && unzip /tmp/Cantaloupe-$CANTALOUPE_VERSION.zip \
  && ln -s cantaloupe-$CANTALOUPE_VERSION cantaloupe \
  && rm -rf /tmp/cantaloupe-$CANTALOUPE_VERSION \
  && rm /tmp/Cantaloupe-$CANTALOUPE_VERSION.zip

#
# Home directory & startup options
#
ARG USER=cantaloupe
ARG HOME=/home/$USER
RUN adduser --home $HOME $USER
RUN chown -R $USER $HOME
RUN chmod o+rx $HOME

USER $USER
WORKDIR $HOME
COPY --chown=cantaloupe ./cantaloupe.properties.default /etc/cantaloupe.properties

RUN curl -OL --silent https://github.com/cantaloupe-project/cantaloupe/releases/download/v${CANTALOUPE_VERSION}/cantaloupe-${CANTALOUPE_VERSION}.zip \
  && unzip /home/$USER/cantaloupe-${CANTALOUPE_VERSION}.zip \
  && rm -f /home/$USER/cantaloupe-${CANTALOUPE_VERSION}.zip \
  # softlink for delegate building
  && ln -s /home/$USER/cantaloupe-${CANTALOUPE_VERSION}/cantaloupe-${CANTALOUPE_VERSION}.jar /home/$USER/cantaloupe.jar

VOLUME ["/var/cache/cantaloupe"]

EXPOSE 8182

ENV JVM_FLAGS="-Dcantaloupe.config=/etc/cantaloupe.properties -Xmx512m"
#CMD /opt/${GRAALVM_PRODUCT}-${GRAALVM_RELEASE}/bin/java ${JVM_FLAGS} -cp /home/cantaloupe/cantaloupe.jar:/home/cantaloupe/delegate.jar -Dcantaloupe.config=/etc/cantaloupe.properties --add-opens java.base/sun.nio.ch=ALL-UNNAMED --add-opens java.base/java.io=ALL-UNNAMED edu.illinois.library.cantaloupe.StandaloneEntry

CMD ["sh", "-c", "java $JVM_FLAGS -Dcantaloupe.config=/etc/cantaloupe.properties -jar /home/cantaloupe/cantaloupe.jar"]
