# -*- coding: utf-8 -*-

import math
import hashlib

from django.contrib.auth.models import User
from django.template.loader import render_to_string
from django.utils.encoding import smart_str
from django.utils.crypto import constant_time_compare

def distance(origin, destination):
    'Haversine formula'
    lat1, lon1 = origin
    lat2, lon2 = destination
    radius = 6371 # km

    dlat = math.radians(lat2-lat1)
    dlon = math.radians(lon2-lon1)
    a = math.sin(dlat/2) * math.sin(dlat/2) + math.cos(math.radians(lat1)) \
        * math.cos(math.radians(lat2)) * math.sin(dlon/2) * math.sin(dlon/2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    d = radius * c

    return d

def signal_to_bar(signal):
    if signal < 0:
        return min(100, max(0, int( 100-( (-signal -50) * 10/4 ) ) ) ) 
    else:
        return 0
    
def notify_admins(node, subject_template, body_template, context, skip=False):
    ''' todo: comment this '''
    admins = User.objects.filter(is_staff=True, userprofile__receive_notifications=True).exclude(email='').select_related().order_by('pk')
    if(len(admins)>0):
        # parse subject (which is the same for every admin)
        subject = render_to_string(subject_template,context)
        # Email subject *must not* contain newlines
        subject = ''.join(subject.splitlines())
        # loop over admins
        for admin in admins:
            # if skip is True and admin is one of the owners do not break his balls again please
            if skip and admin.email == node.email or admin.email == node.email2 or admin.email == node.email3:
                continue
            # include user information in context
            context['admin'] = admin
            # parse message
            message = render_to_string(body_template,context)
            # send email
            admin.email_user(subject, message)

#
# the following functions are needed for versions < than django 1.4 (in django 1.4 these functions are wrapped in django.contrib.auth.utils)
#

UNUSABLE_PASSWORD = '!' # This will never be a valid hash

def get_hexdigest(algorithm, salt, raw_password):
    """
    Returns a string of the hexdigest of the given plaintext password and salt
    using the given algorithm ('md5', 'sha1' or 'crypt').
    """
    raw_password, salt = smart_str(raw_password), smart_str(salt)
    if algorithm == 'crypt':
        try:
            import crypt
        except ImportError:
            raise ValueError('"crypt" password algorithm not supported in this environment')
        return crypt.crypt(raw_password, salt)

    if algorithm == 'md5':
        return hashlib.md5(salt + raw_password).hexdigest()
    elif algorithm == 'sha1':
        return hashlib.sha1(salt + raw_password).hexdigest()
    raise ValueError("Got unknown password algorithm type in password.")

def get_random_string(length=12, allowed_chars='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'):
    """
    Returns a random string of length characters from the set of a-z, A-Z, 0-9
    for use as a salt.

    The default length of 12 with the a-z, A-Z, 0-9 character set returns
    a 71-bit salt. log_2((26+26+10)^12) =~ 71 bits
    """
    import random
    try:
        random = random.SystemRandom()
    except NotImplementedError:
        pass
    return ''.join([random.choice(allowed_chars) for i in range(length)])

def check_password(raw_password, enc_password):
    """
    Returns a boolean of whether the raw_password was correct. Handles
    encryption formats behind the scenes.
    """
    parts = enc_password.split('$')
    if len(parts) != 3:
        return False
    algo, salt, hsh = parts
    return constant_time_compare(hsh, get_hexdigest(algo, salt, raw_password))

def is_password_usable(encoded_password):
    return encoded_password is not None and encoded_password != UNUSABLE_PASSWORD

def make_password(algo, raw_password):
    """
    Produce a new password string in this format: algorithm$salt$hash
    """
    if raw_password is None:
        return UNUSABLE_PASSWORD
    salt = get_random_string()
    hsh = get_hexdigest(algo, salt, raw_password)
    return '%s$%s$%s' % (algo, salt, hsh)